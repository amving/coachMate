import {isProcessed} from '../src/result-only.ts';
import { fingerprint, HttpError } from './sheets.mjs';
import { parseState, goalsOnlyMatch } from '../src/coach-state.ts';

const clean = value => String(value ?? '').trim();
const key = value => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function importHistory(state, matches, options = {}) {
  const next = structuredClone(state);
  const report = [];
  if (state.catalog.archived) throw new HttpError(403, 'Gearchiveerd seizoen.');
  const resolve = name => {
    const found = state.catalog.players.filter(p => key(p.shortName) === key(name) || key(p.name.split(' ')[0]) === key(name));
    if (found.length !== 1) throw new Error(`Speler '${name}' is onbekend of niet uniek.`);
    return found[0].id;
  };
  const counted = (text, allowDefault) => {
    const result = {};
    if (!clean(text) || clean(text) === '-') return result;
    for (const entry of clean(text).split(/[,;\n]+/).map(clean).filter(Boolean)) {
      const match = /^(.*?)\s*(?:\*\s*(\d+)|(\d+)\s*x)$/i.exec(entry);
      if (!match && !allowDefault) throw new Error(`Aantal ontbreekt bij '${entry}'.`);
      const name = match ? match[1] : entry;
      const count = match ? Number(match[2] ?? match[3]) : 1;
      if (count < 1 || count > 99) throw new Error(`Ongeldig aantal bij '${entry}'.`);
      const id = resolve(name);
      if (Object.hasOwn(result,id)) throw new Error(`Speler '${name}' staat dubbel vermeld.`);
      result[id] = count;
    }
    return result;
  };
  for (const match of matches.filter(m => m.teamSeasonId === state.catalog.teamSeasonId && clean(m.Stand))) {
    try {
      if (match.matchId === state.catalog.liveMatchId) throw new Error('Verwijder eerst deze historische wedstrijd uit liveMatchId.');
      const sourceHash = fingerprint([match, options]);
      const prior = state.matchResults?.[match.matchId];
      if (prior?.sourceHash === sourceHash) { report.push({matchId:match.matchId,status:'al verwerkt'}); continue; }
      if (isProcessed(state,match.matchId)) throw new Error('Er bestaan al cijfers; deze worden niet overschreven.');
      const score = /^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/.exec(clean(match.Stand));
      if (!score || !['Thuis','Uit'].includes(match.venue)) throw new Error('Controleer stand en thuis/uit.');
      const goalsFor = Number(score[match.venue === 'Thuis' ? 1 : 2]);
      const goalsAgainst = Number(score[match.venue === 'Thuis' ? 2 : 1]);
      const goals = counted(match.Doelpuntenmakers, false);
      if (Object.values(goals).reduce((a,b)=>a+b,0) !== goalsFor) throw new Error('Doelpuntenmakers tellen niet op tot de teamuitslag.');
      const goalsOnly = goalsOnlyMatch(state, match.matchId);
      const keeperKnown = !goalsOnly && Boolean(clean(match.Keepers) && clean(match.Keepers) !== '-');
      const keepers = goalsOnly ? {} : counted(match.Keepers, options.singleKeeperQuarter === true);
      if (keeperKnown && Object.values(keepers).reduce((a,b)=>a+b,0) !== 4) throw new Error('Keeperkwarten tellen niet op tot 4.');
      if (!goalsOnly && !clean(match.afwezig)) throw new Error('Vul afwezig in, of - als iedereen aanwezig was.');
      const absent = new Set();
      if (!goalsOnly && clean(match.afwezig) !== '-') for (const name of clean(match.afwezig).split(/[,;\n]+/).map(clean).filter(Boolean)) {
        if ((options.ignoreAbsentNames ?? []).some(n => key(n) === key(name))) continue;
        absent.add(resolve(name));
      }
      if ([...absent].some(id => goals[id] || keepers[id])) throw new Error('Afwezige speler heeft goals of keeperkwarten.');
      const rows = state.catalog.players.map(p => ({matchId:match.matchId,playerId:p.id,present:goalsOnly?Boolean(goals[p.id]):!absent.has(p.id),minutes:0,minutesKnown:!goalsOnly&&absent.has(p.id),keeperMinutes:(keepers[p.id]??0)*12.5,keeperMinutesKnown:!goalsOnly&&(absent.has(p.id)||keeperKnown),goals:goals[p.id]??0}));
      next.stats.push(...rows);
      next.matchResults = {...next.matchResults,[match.matchId]:{goalsFor,goalsAgainst,duration:50,sourceHash}};
      report.push({matchId:match.matchId,status:'geïmporteerd',goalsFor,goalsAgainst});
    } catch(error) { report.push({matchId:match.matchId,status:'fout',message:error.message}); }
  }
  // All-or-nothing avoids silently skipping a problematic match.
  if (report.some(r=>r.status==='fout')) throw new HttpError(422, report.filter(r=>r.status==='fout').map(r=>`${r.matchId}: ${r.message}`).join(' '));
  parseState(JSON.stringify(next));
  return {state:next,report,imported:report.filter(r=>r.status==='geïmporteerd').length};
}
