import type { PlayerProfile } from './types.ts';
export function validateProfile(p: PlayerProfile) {
  if (!p || typeof p !== 'object' || Array.isArray(p)
    || Object.keys(p).some(k=>!['goalkeeperEligible','goalkeeperQuality','goalkeeperPreference','positionQualities','maxMinutes','availableFromMs','availableUntilMs'].includes(k))
    || p.goalkeeperEligible !== undefined && typeof p.goalkeeperEligible !== 'boolean'
    || ![p.goalkeeperQuality,p.goalkeeperPreference].every(v=>v===undefined || Number.isFinite(v)&&v>=0&&v<=1)
    || p.positionQualities !== undefined && (!p.positionQualities || typeof p.positionQualities !== 'object' || Array.isArray(p.positionQualities) || !Object.entries(p.positionQualities).every(([k,v])=>k.length>0&&k.length<=30&&Number.isFinite(v)&&v>=0&&v<=1))
    || p.maxMinutes !== undefined && (!Number.isFinite(p.maxMinutes)||p.maxMinutes<0||p.maxMinutes>120||!Number.isSafeInteger(p.maxMinutes*60000))
    || ![p.availableFromMs,p.availableUntilMs].every(v=>v===undefined || Number.isSafeInteger(v)&&v>=0&&v<=7200000)) throw new Error('Ongeldig expliciet spelersprofiel.');
}
