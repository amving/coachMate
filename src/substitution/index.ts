import type { CoachState } from '../coach-state.ts';
import { adaptMatchState } from './adapter.ts';
import { optimizeSubstitutions } from './optimizer.ts';
import { defaultPolicy } from './policy.ts';

// Phase-2 entry point: always pair the actual team state with its persisted policy.
// It reads only; phases 3/4 may consume this result but cannot bypass its validation.
export function planCoachMatch(source:CoachState,options:Parameters<typeof adaptMatchState>[1]) {
  const state=adaptMatchState(source,options);
  return optimizeSubstitutions(state,source.team.substitutionPolicy??defaultPolicy());
}
export { adaptMatchState } from './adapter.ts';
export { optimizeSubstitutions, SEARCH_LIMITS } from './optimizer.ts';
export { defaultPolicy, normalizePolicy } from './policy.ts';
export { validateMatchState, validatePlan, validateExecution, projectMinutes } from './rules.ts';
