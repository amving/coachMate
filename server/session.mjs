import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';

// Encrypted credentials travel only in an HttpOnly cookie, never in browser web storage.
export function sealSession(value, secret) {
  if (!secret) throw new Error('Session encryption is not configured.');
  const iv=randomBytes(12),key=createHash('sha256').update('coachmate-session-v1\0'+secret).digest();
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  const payload=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),payload.toString('base64url'),cipher.getAuthTag().toString('base64url')].join('.');
}
export function openSession(value,secret,now=Date.now()) {
  try {
    if (!secret || typeof value!=='string' || value.length>6000) return null;
    const [version,iv,payload,tag,extra]=value.split('.');
    if(version!=='v1'||extra)return null;
    const decipher=createDecipheriv('aes-256-gcm',createHash('sha256').update('coachmate-session-v1\0'+secret).digest(),Buffer.from(iv,'base64url'));
    decipher.setAuthTag(Buffer.from(tag,'base64url'));
    const data=JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload,'base64url')),decipher.final()]).toString('utf8'));
    return Number.isFinite(data.expires)&&data.expires>now?data:null;
  } catch { return null; }
}
