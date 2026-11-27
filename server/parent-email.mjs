import {fingerprint, HttpError} from './sheets.mjs';
import {parentEmail} from './parents.mjs';
import {openSession, sealSession} from './session.mjs';

const LINK_AGE = 15 * 60 * 1000;
const RESEND_DELAY = 60 * 1000;
const codePattern = /^[A-Za-z0-9_-]{10,1024}$/;
const invitePattern = /^[A-Za-z0-9_-]{43}$/;
const expired = () => new HttpError(403, 'Deze inloglink is ongeldig, verlopen of al gebruikt. Vraag een nieuwe link aan.');
const normalizeEmail = value => typeof value === 'string' ? parentEmail(value.trim()) : '';

export function parentEmailLogin({apiKey, origin, apiOrigin, secret, portal, identityBase, clock = Date.now, request = fetch}) {
  const action = new URL('/auth/parent/email', apiOrigin);
  async function identity(method, data) {
    const response = await request(identityBase + '/v1/accounts:' + method + '?key=' + encodeURIComponent(apiKey), {
      method: 'POST',
      headers: {'Content-Type':'application/json', 'X-Firebase-Locale':'nl'},
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!response || response.status >= 500 || response.status === 429) {
      throw new HttpError(503, 'Inloggen via e-mail is tijdelijk niet beschikbaar. Probeer het later opnieuw.');
    }
    if (!response.ok) {
      if (method === 'signInWithEmailLink') throw expired();
      throw new HttpError(503, 'De inloglink kon niet worden aangevraagd. Probeer het later opnieuw.');
    }
    return response.json();
  }

  return {
    async send(input) {
      const email = normalizeEmail(input?.email);
      if (!email) throw new HttpError(422, 'Vul een geldig e-mailadres in.');
      const invite = typeof input.invite === 'string' && invitePattern.test(input.invite) ? input.invite : '';
      const now = clock();
      const invitation = invite && await portal.store.get('Invites', fingerprint(invite));
      const canClaim = invitation && invitation.data.email === email && !invitation.data.claimedBy &&
        invitation.data.expiresAt > now && portal.enabled(invitation.data.teamSeasonId);
      const links = canClaim ? [] : await portal.store.find('Links', 'email', email);
      const canReturn = links.some(({data}) => data.uid.startsWith('email:') && data.revokedAt === 0 && portal.enabled(data.teamSeasonId));
      if (!canClaim && !canReturn) return;

      const id = fingerprint(['email-login', email]);
      const previous = await portal.store.get('EmailRequests', id);
      if (previous && now - previous.data.sentAt < RESEND_DELAY) return;
      try {
        await portal.store.commit([{collection:'EmailRequests', id, version:previous?.version, data:{sentAt:now}}]);
      } catch (error) {
        if (error instanceof HttpError && error.status === 409) return;
        throw error;
      }
      const state = sealSession({kind:'parent-email', email, invite:canClaim ? invite : '', expires:now + LINK_AGE}, secret);
      const continueUrl = new URL(action);
      continueUrl.searchParams.set('state', state);
      await identity('sendOobCode', {
        requestType:'EMAIL_SIGNIN', email, continueUrl:continueUrl.href, canHandleCodeInApp:true,
      });
    },
    landing(params) {
      const landing = new URL('/?parent=1', origin);
      const code = params.get('oobCode');
      let state = params.get('state');
      if (!state && params.has('continueUrl')) {
        try {
          const next = new URL(params.get('continueUrl'));
          if (next.origin === action.origin && next.pathname === action.pathname) state = next.searchParams.get('state');
        } catch {}
      }
      if (params.get('mode') === 'signIn' && code && codePattern.test(code) && state && state.length <= 1024) {
        landing.hash = new URLSearchParams({emailCode:code, emailState:state}).toString();
      } else {
        landing.searchParams.set('auth', 'email-invalid');
      }
      return landing.href;
    },
    async redeem(input) {
      const email = normalizeEmail(input?.email);
      const state = typeof input?.state === 'string' && input.state.length <= 1024 ? openSession(input.state, secret) : null;
      if (!email || state?.kind !== 'parent-email' || state.expires <= clock() ||
          state.email !== email || typeof input?.code !== 'string' || !codePattern.test(input.code)) throw expired();
      const account = await identity('signInWithEmailLink', {email, oobCode:input.code});
      if (parentEmail(account.email) !== email || typeof account.localId !== 'string' || !account.localId) throw expired();
      return {uid:'email:' + account.localId, email, verifiedMailbox:true, invite:state.invite};
    },
  };
}
