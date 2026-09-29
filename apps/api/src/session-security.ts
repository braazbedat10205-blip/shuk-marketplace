import { createHash,randomBytes,randomUUID } from 'crypto';

export const digestSessionToken=(token:string)=>createHash('sha256').update(token).digest('hex');
export const newRefreshToken=()=>randomBytes(48).toString('base64url');
export const newSessionId=()=>randomUUID();
export const isSessionUsable=(session:{revokedAt:Date|null;expiresAt:Date},now=new Date())=>!session.revokedAt&&session.expiresAt>now;
