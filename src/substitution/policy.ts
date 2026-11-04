export type SubstitutionPolicy = {
  schemaVersion: 1; version: number;
  weights: { fairness: number; rotation: number; tactical: number };
  historyMatches: number; compensationFactor: number; maxHistoricalCorrection: number;
  preferBundled: boolean; preferPeriodTransitions: boolean; preferWholePeriodsOnBench: boolean;
  goalkeeperMode: 'ROTATING' | 'FIXED'; reminderSeconds: number;
  fairnessToleranceMs: number;
};
export function defaultPolicy(version = 1): SubstitutionPolicy {
  return { schemaVersion: 1, version, weights: {fairness: .5, rotation: .3, tactical: .2},
    historyMatches: 5, compensationFactor: .3, maxHistoricalCorrection: .15,
    preferBundled: true, preferPeriodTransitions: true, preferWholePeriodsOnBench: true,
    goalkeeperMode: 'ROTATING', reminderSeconds: 30, fairnessToleranceMs: 30000 };
}
export function normalizePolicy(input: SubstitutionPolicy): SubstitutionPolicy {
  const keys = Object.keys(defaultPolicy());
  if (!input || Object.keys(input).some(k => !keys.includes(k)) || input.schemaVersion !== 1
    || !Number.isSafeInteger(input.version) || input.version < 1
    || !input.weights || Object.keys(input.weights).sort().join() !== 'fairness,rotation,tactical'
    || !Object.values(input.weights).every(v => Number.isFinite(v) && v >= 0 && v <= 100)
    || !Number.isInteger(input.historyMatches) || input.historyMatches < 1 || input.historyMatches > 50
    || ![input.compensationFactor, input.maxHistoricalCorrection].every(v => Number.isFinite(v) && v >= 0 && v <= 1)
    || ![input.preferBundled, input.preferPeriodTransitions, input.preferWholePeriodsOnBench].every(v => typeof v === 'boolean')
    || !['ROTATING', 'FIXED'].includes(input.goalkeeperMode)
    || !Number.isInteger(input.reminderSeconds) || input.reminderSeconds < 0 || input.reminderSeconds > 600
    || !Number.isInteger(input.fairnessToleranceMs) || input.fairnessToleranceMs < 0 || input.fairnessToleranceMs > 60000) throw new Error('Ongeldig wisselbeleid.');
  const sum = input.weights.fairness + input.weights.rotation + input.weights.tactical;
  if (!(sum > 0)) throw new Error('Minstens één beleidsgewicht moet positief zijn.');
  return {...input, weights: {fairness: input.weights.fairness/sum, rotation: input.weights.rotation/sum, tactical: input.weights.tactical/sum}};
}
export function revisePolicy(current: SubstitutionPolicy | undefined, input?: SubstitutionPolicy): SubstitutionPolicy {
  const version = (current?.version ?? 0) + 1;
  return input ? normalizePolicy({...input, version}) : defaultPolicy(version);
}
