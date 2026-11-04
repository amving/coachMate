// Separate from total played time: continuous load, waiting time and previous turns.
export function rotationPriority(benchMs:number,continuousMs:number,substitutionCount:number,durationMs:number) {
  return (benchMs-continuousMs)/Math.max(1,durationMs)-substitutionCount/100;
}
