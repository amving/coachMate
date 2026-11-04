import { schema } from './schema.mjs';
import { HttpError, loadTeam, stateTables } from './sheets.mjs';

export const clubCode = name => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The first club assignment migrates the entire team's foreign keys in one Sheets batch.
// Later display-name corrections keep the established identity stable.
export function clubMigration(snapshot, teamSeasonId, input) {
  const { state, revision } = loadTeam(snapshot, teamSeasonId);
  if (state.catalog.archived) throw new HttpError(403, 'Dit seizoen is gearchiveerd en alleen leesbaar.');
  const clubName = typeof input.clubName === 'string' ? input.clubName.trim() : '';
  const teamName = typeof input.teamName === 'string' ? input.teamName.trim() : '';
  if (!clubName || clubName.length > 200 || !teamName || teamName.length > 200) throw new HttpError(422, 'Vul een clubnaam en teamnaam in (maximaal 200 tekens).');
  const clubId = state.catalog.clubId || clubCode(clubName);
  if (!clubId || clubId.length > 60 || ['constructor', 'prototype', '__proto__'].includes(clubId)) throw new HttpError(422, 'De clubnaam levert geen geldige clubcode op.');
  if (snapshot.tables.TeamSeasons.some(t => t.teamSeasonId !== teamSeasonId && t.clubId === clubId && t.clubName !== clubName)) throw new HttpError(409, 'Deze clubcode bestaat al. Gebruik dezelfde clubnaam als de andere teams.');
  const nextId = state.catalog.clubId ? teamSeasonId : `${clubId}-${clubCode(teamName)}-${state.catalog.seasonId}`;
  if (nextId.length > 100 || !clubCode(teamName)) throw new HttpError(422, 'Gebruik een kortere club- of teamnaam.');
  if (snapshot.tables.TeamSeasons.some(t => t.teamSeasonId !== teamSeasonId && t.teamSeasonId === nextId)) throw new HttpError(409, 'Dit club-teamseizoen bestaat al. De gegevens zijn niet samengevoegd.');
  const tables = { ...snapshot.tables };
  for (const [name, headers] of Object.entries(schema)) {
    if (headers.includes('teamSeasonId')) tables[name] = tables[name].map(row => row.teamSeasonId === teamSeasonId ? { ...row, teamSeasonId: nextId } : row);
  }
  tables.TeamSeasons = tables.TeamSeasons.map(t => t.teamSeasonId === nextId ? { ...t, clubId, clubName, teamName } : t);
  state.catalog = { ...state.catalog, teamSeasonId: nextId, clubId, clubName, teamName };
  if(nextId!==teamSeasonId&&state.assistant)state.assistant=Object.fromEntries(Object.entries(state.assistant).map(([id,s])=>[id,{...s,context:'',plan:{...s.plan,teamSeasonId:nextId}}]));
  Object.assign(tables, stateTables({ ...snapshot, tables }, nextId, state, revision + 1));
  // Validate the reconstructed state before any external mutation.
  loadTeam({ ...snapshot, tables }, nextId);
  const replacements = Object.fromEntries(Object.entries(tables).filter(([name]) => schema[name].includes('teamSeasonId')));
  return { teamSeasonId: nextId, replacements };
}
