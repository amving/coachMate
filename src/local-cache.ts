import {applyActionBatch} from './action-batch.ts';
import { parseState, STORAGE_KEY, type Action, type CoachState } from './coach-state.ts';

export type LocalJournal = { version: 1; id: string; account: string; teamSeasonId: string; revision: number; sourceToken: string; actions: Action[]; state: CoachState; attempted?: boolean };
export const journalKey = (account: string, team: string) => `coachmate:local-journal:${account}:${team}`;
function journalEnvelope(raw:string,account:string,team:string):LocalJournal {
  const journal = JSON.parse(raw) as LocalJournal;
  if (!journal || journal.version !== 1 || journal.account !== account || journal.teamSeasonId !== team || !/^[a-zA-Z0-9-]{1,100}$/.test(journal.id) || !Number.isInteger(journal.revision) || journal.revision<0 || typeof journal.sourceToken !== 'string' || !Array.isArray(journal.actions) || !journal.actions.length || journal.actions.length > 2000 || journal.attempted!==undefined&&typeof journal.attempted!=='boolean') throw new Error('Het lokale wedstrijdconcept kan niet veilig worden gelezen. Exporteer het via Instellingen.');
  if (journal.state?.catalog?.teamSeasonId !== team) throw new Error('Het lokale concept hoort bij een ander teamseizoen.');
  return journal;
}
export function readJournal(storage: Pick<Storage, 'getItem'>, account: string, team: string): LocalJournal | null {
  const raw = storage.getItem(journalKey(account, team));
  if (!raw) return null;
  const journal=journalEnvelope(raw,account,team);
  journal.state = parseState(JSON.stringify(journal.state));
  return journal;
}

export function archiveConfirmedJournal(storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,account:string,team:string,latest:CoachState):boolean {
  if(latest.catalog?.teamSeasonId!==team)throw new Error('Opslagbevestiging hoort bij een ander team.');
  const key=journalKey(account,team),raw=storage.getItem(key);
  if(raw===null)return false;
  const draft=journalEnvelope(raw,account,team);
  if(!latest.committedBatches?.includes(draft.id))return false;
  const backup=`${key}:backup:${draft.id}:confirmed`;
  if(storage.getItem(backup)===null)storage.setItem(backup,raw);
  if(storage.getItem(key)!==raw)throw new Error('Het concept is intussen gewijzigd. Laad het team opnieuw.');
  storage.removeItem(key);
  return true;
}

// An unreadable snapshot must not hide the raw journal or be replaced by demo data.
// Rebuild only against the exact original source. This is a preview, never an upload.
export function rebuildJournal(storage:Pick<Storage,'getItem'>,account:string,team:string,latest:CoachState,revision:number,sourceToken:string):LocalJournal {
  const raw=storage.getItem(journalKey(account,team));
  if(!raw)throw new Error('Geen lokaal wedstrijdconcept gevonden voor dit account en team.');
  const draft=journalEnvelope(raw,account,team);
  if(latest.catalog?.teamSeasonId!==team||latest.catalog.archived)throw new Error('Het herstel hoort niet bij een actief teamseizoen.');
  if(latest.committedBatches?.includes(draft.id))throw new Error('Deze opslag is al bevestigd in Google. Laad het team opnieuw.');
  if(revision!==draft.revision||sourceToken!==draft.sourceToken)throw new Error('De bron is gewijzigd sinds dit concept. Exporteer het herstelbestand; automatisch reconstrueren is niet veilig.');
  const restored=applyActionBatch(latest,draft.actions);
  if(restored.catalog?.liveMatchId!==draft.state.catalog?.liveMatchId)throw new Error('Het herstelde concept hoort bij een andere wedstrijd.');
  return {...draft,state:restored};
}

export function storeRebuiltJournal(storage:Pick<Storage,'getItem'|'setItem'>,draft:LocalJournal,expectedRaw:string):void {
  const key=journalKey(draft.account,draft.teamSeasonId);
  if(storage.getItem(key)!==expectedRaw)throw new Error('Het concept is intussen gewijzigd. Controleer het opnieuw.');
  parseState(JSON.stringify(draft.state));
  const backup=`${key}:backup:${draft.id}:before-rebuild`;
  if(storage.getItem(backup)===null)storage.setItem(backup,expectedRaw);
  storage.setItem(key,JSON.stringify(draft));
}

export function recoveryStorage(storage:Pick<Storage,'getItem'|'key'|'length'>,account:string,team:string):Record<string,string> {
  const result:Record<string,string>={},base=journalKey(account,team);
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i);
    if(key&&(key===base||key.startsWith(base+':backup:')||key===STORAGE_KEY)){
      const raw=storage.getItem(key);if(raw!==null)result[key]=raw;
    }
  }
  return result;
}

// Migrate existing tab drafts without discarding them. New drafts survive browser closure.
export function readDraft(key: string): string | null {
  const persistent = localStorage.getItem(key);
  return persistent ?? sessionStorage.getItem(key);
}

// Recovery is a preview. The caller must explicitly confirm before replacing or uploading the journal.
export function previewJournalRecovery(journal:LocalJournal, latest:CoachState):CoachState {
  if(latest.catalog?.teamSeasonId!==journal.teamSeasonId || latest.catalog.archived) throw new Error('Dit concept hoort niet bij een actief teamseizoen.');
  if(latest.catalog.liveMatchId!==journal.state.catalog?.liveMatchId) throw new Error('De actuele bron heeft een andere livewedstrijd. Exporteer het concept; samenvoegen is hier niet veilig.');
  if(latest.live.phase==='Einde') throw new Error('Deze wedstrijd is inmiddels verwerkt. Vergelijk de opgeslagen cijfers via Statistieken; het lokale concept blijft behouden.');
  const next=applyActionBatch(latest,journal.actions);
  return next;
}
