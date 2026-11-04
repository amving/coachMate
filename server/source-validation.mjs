// Reject broken foreign keys before a team can silently lose rows during filtering.
export function sourceProblem(tables) {
  const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) && !['__proto__','constructor','prototype'].includes(value);
  for (const [name, key, scoped] of [['Seasons','seasonId',false],['TeamSeasons','teamSeasonId',false],['Players','playerId',true],['Matches','matchId',true]]) {
    const seen = new Set();
    for (const [i, row] of tables[name].entries()) {
      if (!id(row[key])) return `${name}: ${key} ontbreekt of is ongeldig bij gegevensregel ${i+1}. Vul de regel volledig in; laat nieuwe codes door de Sheet toewijzen.`;
      const identity = scoped ? `${row.teamSeasonId}/${row[key]}` : row[key];
      if (seen.has(identity)) return `${name}: dubbele ${key} (${row[key]}). Kopieer geen bestaande codes naar nieuwe regels.`;
      seen.add(identity);
    }
  }
  if (tables.Matches.some(m => m.availabilityRound !== undefined && m.availabilityRound !== '' && (!Number.isInteger(Number(m.availabilityRound)) || Number(m.availabilityRound) < 1))) return 'Matches: availabilityRound moet een positief rondenummer zijn.';
  const seasons = new Set(tables.Seasons.map(s => s.seasonId));
  const teams = new Set(tables.TeamSeasons.map(t => t.teamSeasonId));
  for (const team of tables.TeamSeasons) {
    if (!seasons.has(team.seasonId)) return `TeamSeasons: seizoen ${team.seasonId || '(leeg)'} bestaat niet in Seasons.`;
    if (![2,4].includes(Number(team.periods))) return 'TeamSeasons: periods moet 2 of 4 zijn.';
    if (team.liveMatchId && !tables.Matches.some(m => m.teamSeasonId === team.teamSeasonId && m.matchId === team.liveMatchId)) return `TeamSeasons: liveMatchId ${team.liveMatchId} hoort niet bij dit team.`;
  }
  for (const name of ['Players','Matches','State','Availability','MatchStats','Forms']) {
    for (const row of tables[name]) if (!teams.has(row.teamSeasonId)) return `${name}: teamSeasonId ${row.teamSeasonId || '(leeg)'} bestaat niet in TeamSeasons.`;
  }
  return null;
}
