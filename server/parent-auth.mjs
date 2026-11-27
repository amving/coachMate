import {randomBytes} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import {HttpError} from './sheets.mjs';
import {parentEmail} from './parents.mjs';
import {openSession,sealSession} from './session.mjs';

const random = () => randomBytes(32).toString('base64url');
const ATTEMPT_AGE = 10 * 60;
const SESSION_AGE = 8 * 60 * 60;

export function parentAuth({clientId,clientSecret,secret,origin,apiOrigin}) {
  const secure = new URL(apiOrigin).protocol === 'https:';
  const sessionName = secure ? '__Host-coachmate_parent' : 'coachmate_parent';
  const attemptName = secure ? '__Host-coachmate_parent_oauth' : 'coachmate_parent_oauth';
  const client = () => new OAuth2Client(clientId,clientSecret,apiOrigin+'/auth/parent/callback');
  const cookie = (name,value,age) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`;
  const redirect = (res,location) => res.writeHead(302,{Location:location}).end();
  const finish = (res,status) => redirect(res,origin+'/?parent=1&auth='+status);
  const sessionCookie = ({uid,email,verifiedMailbox}) => {
    const saved = {kind:'parent',uid,email,verifiedMailbox,csrf:random(),expires:Date.now()+SESSION_AGE*1000};
    return cookie(sessionName,sealSession(saved,secret),SESSION_AGE);
  };

  return {
    session(cookies) {
      const saved = openSession(cookies[sessionName],secret);
      return saved?.kind==='parent'&&typeof saved.uid==='string'&&parentEmail(saved.email)&&typeof saved.csrf==='string'?saved:null;
    },
    async login(res) {
      const oauth = client();
      const {codeVerifier,codeChallenge} = await oauth.generateCodeVerifierAsync();
      const state = random(), nonce = random();
      const attempt = {kind:'parent-oauth',state,nonce,codeVerifier,expires:Date.now()+ATTEMPT_AGE*1000};
      res.setHeader('Set-Cookie',cookie(attemptName,sealSession(attempt,secret),ATTEMPT_AGE));
      return redirect(res,oauth.generateAuthUrl({
        access_type:'online',prompt:'select_account',scope:['openid','email'],
        state,nonce,code_challenge:codeChallenge,code_challenge_method:'S256',
      }));
    },
    async callback(res,params,cookies) {
      const state = params.get('state');
      const attempt = openSession(cookies[attemptName],secret);
      if(!state||attempt?.kind!=='parent-oauth'||attempt.state!==state) {
        throw new HttpError(403,'De ouderaanmelding is verlopen. Open CoachMate opnieuw en probeer het nog eens.');
      }
      const clearAttempt = cookie(attemptName,'',0);
      res.setHeader('Set-Cookie',clearAttempt);
      if(params.has('error'))return finish(res,params.get('error')==='access_denied'?'cancelled':'failed');
      const code = params.get('code');
      if(!code)return finish(res,'failed');
      try {
        const oauth = client();
        const {tokens} = await oauth.getToken({code,codeVerifier:attempt.codeVerifier});
        const ticket = await oauth.verifyIdToken({idToken:tokens.id_token,audience:clientId});
        const profile = ticket.getPayload();
        const email = parentEmail(profile?.email);
        if(profile?.email_verified!==true||profile.nonce!==attempt.nonce||!email||typeof profile.sub!=='string'||!profile.sub)return finish(res,'failed');
        // Google can verify current mailbox ownership for Gmail and hosted Workspace accounts.
        const verifiedMailbox = email.endsWith('@gmail.com')||(typeof profile.hd==='string'&&profile.hd.length>0);
        res.setHeader('Set-Cookie',[sessionCookie({uid:profile.sub,email,verifiedMailbox}),clearAttempt]);
        return redirect(res,origin+'/?parent=1');
      } catch {
        return finish(res,'failed');
      }
    },
    createSession(res, identity) {
      res.setHeader('Set-Cookie',sessionCookie(identity));
    },
    clear(res) {
      res.setHeader('Set-Cookie',cookie(sessionName,'',0));
    },
  };
}
