import { coachReducer, parseState, type Action, type CoachState } from './coach-state.ts';

export const localActionTypes = new Set(['assistant-prepare','assistant-plan','assistant-decision','assistant-adjust','assistant-execute','prepare-match', 'toggle-clock', 'phase', 'set-period', 'goal', 'away-goal', 'edit-goal', 'undo-goal', 'keeper', 'swap']);
const batchTypes = new Set([...localActionTypes, 'set-formations','finish', 'set-periods', 'set-field-size','set-substitution-policy','set-substitution-profiles']);

// Replay original event times: using upload time would lose playing/rest time.
export function applyActionBatch(state: CoachState, actions: Action[], now = Date.now()): CoachState {
  if (!Array.isArray(actions) || !actions.length || actions.length > 2000) throw new Error('Ongeldig aantal wijzigingen.');
  let next = state;
  let lastTime = 0;
  for (const action of actions) {
    if (!action || !batchTypes.has(action.type)) throw new Error('Onbekende conceptactie.');
    if ('now' in action && action.now !== undefined) {
      if (!Number.isFinite(action.now) || action.now < lastTime || action.now < 0 || action.now > now + 60000) throw new Error('Ongeldige tijd in wedstrijdconcept.');
      lastTime = action.now;
    }
    const previous = next;
    next = coachReducer(next, action);
    if((action.type.startsWith('assistant-')||action.type==='set-formations'||action.type==='set-substitution-policy'||action.type==='set-substitution-profiles')&&next===previous) {
      const isReplay=action.type.startsWith('assistant-')&&'eventId' in action&&Object.values(previous.assistant??{}).some(s=>s.events.some(e=>e.id===action.eventId));
      if(!isReplay)throw new Error('Het wisseladvies of beleid is verouderd of ongeldig. Je concept blijft behouden.');
    }
    if (['swap','keeper','goal','edit-goal','prepare-match'].includes(action.type) && next === previous) throw new Error('Een lokale wedstrijdactie past niet meer bij de actuele opstelling. Controleer het concept.');
  }
  return parseState(JSON.stringify(next));
}
