import { createHash } from 'node:crypto';
import { schema } from './schema.mjs';
import { sourceProblem } from './source-validation.mjs';
import { createTeamState, parseState, validateCatalog } from '../src/coach-state.ts';
import { validateProfile } from '../src/substitution/profile.ts';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Delivery heartbeats, personal links and other teams are not edits to this team's match data.
export function teamSourceToken(snapshot, teamSeasonId) {
  const team = snapshot.tables.TeamSeasons.find(row => row.teamSeasonId === teamSeasonId);
  return 'team-v2:' + fingerprint(Object.fromEntries(['Seasons','TeamSeasons','Players','Matches','State','Availability','MatchStats'].map(name => [name,
    (snapshot.tables[name] ?? []).filter(row => name === 'Seasons' ? row.seasonId === team?.seasonId : row.teamSeasonId === teamSeasonId)
  ])));
}
const columnName = n => { let label=''; while(n>0){n--;label=String.fromCharCode(65+n%26)+label;n=Math.floor(n/26);}return label; };
const sourceKey = (name,label) => schema[name].find(key=>key.toLowerCase()===String(label).trim().toLowerCase()) ?? String(label).trim();
const mappedSource = name => ['Matches','Players'].includes(name);
const optionalTable = name => ['FormJobs','FormDeliveries'].includes(name);
export class SheetsStore {
  constructor(auth, spreadsheetId) { this.auth = auth; this.base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`; }
  async read() {
    const meta = (await this.auth.request({ url: this.base, params: { fields: 'sheets.properties' } })).data;
    const sheets = Object.fromEntries(meta.sheets.map(s => [s.properties.title, s.properties]));
    for (const name of Object.keys(schema)) if (!sheets[name] && !optionalTable(name)) throw new HttpError(422, `Tabblad ${name} ontbreekt in de bron.`);
    const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' });
    const presentNames=Object.keys(schema).filter(name=>sheets[name]);
    for (const name of presentNames) params.append('ranges', `'${name}'!A1:${columnName(mappedSource(name) ? Math.min(200, sheets[name].gridProperties.columnCount ?? schema[name].length) : Math.min(schema[name].length, sheets[name].gridProperties.columnCount ?? schema[name].length))}${Math.min(20001, sheets[name].gridProperties.rowCount)}`);
    const result = (await this.auth.request({ url: `${this.base}/values:batchGet`, params })).data;
    const tables = {};
    const rowCounts = {};
    const tableHeaders = {};
    const tableRows = {};
    Object.entries(schema).forEach(([name, headers]) => {
      const rows = sheets[name] ? result.valueRanges[presentNames.indexOf(name)].values ?? [] : [];
      if(!sheets[name] && optionalTable(name)){tables[name]=[];rowCounts[name]=0;return;}
      rowCounts[name] = rows.length;
      if (rows.length >= 20001) throw new HttpError(422, `${name} overschrijdt de ondersteunde omvang.`);
      if (mappedSource(name)) {
        const actual=(rows[0]??[]).map(label=>String(label));
        const keys=actual.map(label=>sourceKey(name,label));
        const required=name==='Matches'?headers.slice(0,8):headers.filter(key=>!['parentEmail','parentPhone','substitutionProfile','parentName'].includes(key));
        const missing=required.filter(key=>!keys.includes(key));
        if(missing.length) throw new HttpError(422, `${name}: verplichte kolommen ontbreken: ${missing.join(', ')}. Behoud de bestaande gegevens en controleer de kolomkoppen.`);
        // Empty spacer columns are harmless; unnamed columns containing data are ambiguous.
        const invalid=keys.flatMap((key,col)=>(!key && rows.slice(1).some(row=>row[col]!==undefined&&row[col]!==null&&row[col]!=='')) || ['__proto__','prototype','constructor'].includes(key) ? [columnName(col+1)] : []);
        if(invalid.length) throw new HttpError(422, `${name}: geef de lege of ongeldige kolomkoppen ${invalid.join(', ')} een unieke naam.`);
        const duplicates=[...new Set(keys.filter((key,col)=>key&&keys.indexOf(key)!==col))];
        if(duplicates.length) throw new HttpError(422, `${name}: dubbele kolomkoppen: ${duplicates.map(key=>`${key} (${keys.flatMap((value,col)=>value===key?[columnName(col+1)]:[]).join(', ')})`).join('; ')}. Behoud iedere kolomkop één keer.`);
        tableHeaders[name]=actual;
        tableRows[name]=rows.slice(1).flatMap((row,i)=>row.some(v=>v!=='')?[i+1]:[]);
        tables[name]=rows.slice(1).filter(row=>row.some(v=>v!=='')).map(row=>({...Object.fromEntries(headers.map(key=>[key,''])),...Object.fromEntries(keys.flatMap((key,col)=>key?[[key,row[col]??'']]:[]))}));
        return;
      }
      const oldLength = { TeamSeasons: 5, Matches: 8, MatchStats: 8, Forms: 7, FormInvites: 3, FormResponses:4, FormDeliveries:11 }[name];
      const legacyTeam = oldLength && [oldLength, ...(name === 'Matches' ? [12] : name === 'Forms' ? [8] : name === 'FormInvites' ? [4,5,6,7,8,9,10,11] : name === 'FormDeliveries' ? [12] : [])].some(n => JSON.stringify(rows[0]) === JSON.stringify(headers.slice(0, n)));
      if (!legacyTeam && JSON.stringify(rows[0]) !== JSON.stringify(headers)) throw new HttpError(422, `Kolommen in ${name} wijken af van het CoachMate-schema.`);
      tables[name] = rows.slice(1).filter(r => r.some((v, col) => v !== '' && !(name === 'Seasons' && col === 2 && v === false))).map(row => Object.fromEntries(headers.map((key, col) => [key, row[col] ?? ''])));
    });
    const problem = sourceProblem(tables);
    if (problem) throw new HttpError(422, problem);
    return { sheets, tables, rowCounts, tableHeaders, tableRows, token: fingerprint({tables,tableHeaders}) };
  }
  async write(snapshot, replacements) {
    // A single application instance serializes writes; detect edits made in Sheets since the read.
    const current = await this.read();
    if (current.token !== snapshot.token && Object.keys(replacements).some(name =>
      fingerprint(current.tables[name]) !== fingerprint(snapshot.tables[name]) ||
      fingerprint(current.tableHeaders?.[name] ?? null) !== fingerprint(snapshot.tableHeaders?.[name] ?? null)
    )) throw new HttpError(409, 'De bron is gewijzigd. Controleer de nieuwste gegevens voordat je opnieuw opslaat.');
    const requests = [];
    for (const [name, records] of Object.entries(replacements)) {
      if (!schema[name]) throw new Error('Unknown table');
      let props = current.sheets[name];
      if(!props && optionalTable(name)) {
        const sheetId=Math.max(0,...Object.values(current.sheets).map(sheet=>sheet.sheetId))+1;
        props={sheetId,gridProperties:{rowCount:1000,columnCount:26}};
        current.sheets[name]=props;
        requests.push({addSheet:{properties:{sheetId,title:name,gridProperties:props.gridProperties}}});
      }
      const headers=mappedSource(name) && current.tableHeaders?.[name] ? [...current.tableHeaders[name], ...schema[name].filter(key=>!current.tableHeaders[name].map(label=>sourceKey(name,label)).includes(key))] : schema[name];
      const keys=mappedSource(name)?headers.map(label=>sourceKey(name,label)):headers;
      const rows = [headers, ...records.map(row => keys.map(key => row[key] ?? ''))];
      if (rows.length > 20000) throw new HttpError(422, 'De gegevens zijn te omvangrijk voor deze backend.');
      if (headers.length > props.gridProperties.columnCount) requests.push({appendDimension:{sheetId:props.sheetId,dimension:'COLUMNS',length:headers.length-props.gridProperties.columnCount}});
      if(mappedSource(name) && current.tableHeaders?.[name] && current.tableRows?.[name]) {
        const previous=current.tables[name];
        if(records.length<previous.length || previous.some((row,i)=>(name==='Matches'?row.matchId:row.playerId)!==(name==='Matches'?records[i]?.matchId:records[i]?.playerId))) throw new HttpError(422,`Bestaande regels in ${name} mogen bij het opslaan niet worden verwijderd of verplaatst.`);
        const endRow=(current.rowCounts[name]??1)+records.length-previous.length;
        if(endRow>props.gridProperties.rowCount) requests.push({appendDimension:{sheetId:props.sheetId,dimension:'ROWS',length:endRow-props.gridProperties.rowCount}});
        const cells=value=>({userEnteredValue:typeof value==='number'?{numberValue:value}:typeof value==='boolean'?{boolValue:value}:{stringValue:String(value??'')}});
        requests.push({updateCells:{range:{sheetId:props.sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:headers.length},fields:'userEnteredValue',rows:[{values:headers.map(cells)}]}});
        records.forEach((record,i)=>{
          if(i>=previous.length) {
            const rowIndex=current.rowCounts[name]+i-previous.length;
            requests.push({updateCells:{range:{sheetId:props.sheetId,startRowIndex:rowIndex,endRowIndex:rowIndex+1,startColumnIndex:0,endColumnIndex:headers.length},fields:'userEnteredValue',rows:[{values:keys.map(key=>cells(record[key]??''))}]}});
          } else keys.forEach((key,col)=>{
            if(!(name==='Matches'?[...schema.Matches.slice(0,8),'availabilityRound']:schema.Players).includes(key) || (previous[i][key]??'')===(record[key]??'')) return;
            const rowIndex=current.tableRows[name][i];
            requests.push({updateCells:{range:{sheetId:props.sheetId,startRowIndex:rowIndex,endRowIndex:rowIndex+1,startColumnIndex:col,endColumnIndex:col+1},fields:'userEnteredValue',rows:[{values:[cells(record[key])]}]}});
          });
        });
        continue;
      }
      if (rows.length > props.gridProperties.rowCount) requests.push({ appendDimension: { sheetId: props.sheetId, dimension: 'ROWS', length: rows.length - props.gridProperties.rowCount } });
      requests.push({ updateCells: { range: { sheetId: props.sheetId, startRowIndex: 0, endRowIndex: Math.max(rows.length, current.rowCounts[name]), startColumnIndex: 0, endColumnIndex: headers.length }, fields: 'userEnteredValue', rows: rows.map(row => ({ values: row.map(v => ({ userEnteredValue: typeof v === 'number' ? { numberValue: v } : typeof v === 'boolean' ? { boolValue: v } : { stringValue: String(v) } })) })) } });
    }
    // Disable automatic retries for non-idempotent changes. Re-read after an uncertain network result.
    await this.auth.request({ url: `${this.base}:batchUpdate`, method: 'POST', data: { requests }, retry: false });
  }
}

export function catalogFor(tables, teamSeasonId) {
  const profileFor = row => {
    if (row.substitutionProfile === undefined || row.substitutionProfile === '') return {};
    try {
      const profile=JSON.parse(row.substitutionProfile);validateProfile(profile);return {substitutionProfile:profile};
    } catch { throw new HttpError(422, `Players: ongeldig substitutionProfile voor ${row.playerId}. Gebruik geldige JSON met expliciete kwaliteiten en limieten.`); }
  };
  const team = tables.TeamSeasons.find(t => t.teamSeasonId === teamSeasonId);
  if (!team) throw new HttpError(404, 'Teamseizoen niet gevonden.');
  const season = tables.Seasons.find(s => s.seasonId === team.seasonId);
  if (!season || ![true, false].includes(season.archived) || ![2, 4].includes(Number(team.periods))) throw new HttpError(422, 'Controleer seizoen en wedstrijdindeling in de Sheet.');
  const catalog = { teamSeasonId, seasonId: season.seasonId, seasonName: season.name, teamName: team.teamName, archived: season.archived,
    liveMatchId: team.liveMatchId, ...(team.clubId || team.clubName ? { clubId: team.clubId, clubName: team.clubName } : {}),
    players: tables.Players.filter(p => p.teamSeasonId === teamSeasonId).map(p => ({ id: p.playerId, number: Number(p.number), name: p.name, shortName: p.shortName, parent: p.parent, ...(p.parentName?{parentName:String(p.parentName).trim()}:{}), ...(p.parentEmail?{parentEmail:String(p.parentEmail).trim()}:{}), ...(p.parentPhone?{parentPhone:String(p.parentPhone).trim()}:{}), position: p.position, ...profileFor(p) })),
    matches: tables.Matches.filter(m => m.teamSeasonId === teamSeasonId).map(m => ({ id: m.matchId, pool: m.pool, date: m.date, shortDate: m.shortDate, time: m.time, opponent: m.opponent, venue: m.venue, availabilityRound: Number(m.availabilityRound || 1) })),
  };
  validateCatalog(catalog);
  return { catalog, periods: Number(team.periods) };
}
export function loadTeam(snapshot, teamSeasonId) {
  const { catalog, periods } = catalogFor(snapshot.tables, teamSeasonId);
  const chunks = snapshot.tables.State.filter(r => r.teamSeasonId === teamSeasonId).sort((a,b) => Number(a.part) - Number(b.part));
  if (!chunks.length) return { state: createTeamState(catalog, periods), revision: 0, sourceToken: teamSourceToken(snapshot, teamSeasonId) };
  if (!chunks.every((r, i) => Number(r.part) === i && r.revision === chunks[0].revision)) throw new HttpError(422, 'Onvolledige wedstrijdopslag.');
  const state = parseState(chunks.map(c => c.json).join(''));
  if (state.catalog?.teamSeasonId !== teamSeasonId) throw new HttpError(422, 'Teamseizoen komt niet overeen.');
  // Additions are safe; removing historic IDs would orphan scores, minutes or availability.
  if (state.catalog.players.some(p => !catalog.players.some(n => n.id === p.id))
    || state.catalog.matches.some(m => !catalog.matches.some(n => n.id === m.id))
    || state.catalog.seasonId !== catalog.seasonId) throw new HttpError(422, 'Verwijder geen gebruikte spelers/wedstrijden en wijzig het seizoen van een bestaand team niet. Maak voor een nieuw seizoen een nieuw teamSeasonId.');
  catalog.matches = catalog.matches.map(m => ({...m, availabilityRound: Number(snapshot.tables.Matches.find(row => row.teamSeasonId === teamSeasonId && row.matchId === m.id)?.availabilityRound || state.catalog.matches.find(old => old.id === m.id)?.availabilityRound || 1)}));
  const fresh = createTeamState(catalog, periods, state.team.fieldSize ?? 6);
  if (state.catalog.liveMatchId !== catalog.liveMatchId) {
    if (state.live.phase !== 'Einde') throw new HttpError(422, 'Sluit de vorige wedstrijd eerst af voordat je liveMatchId wijzigt.');
    if (state.stats.some(r => r.matchId === catalog.liveMatchId)) throw new HttpError(422, 'Deze wedstrijd is al afgesloten. Corrigeer de cijfers via Statistieken.');
    state.live = fresh.live;
  } else {
    state.live.played = { ...fresh.live.played, ...state.live.played };
    if (!state.catalog.players.length && catalog.players.length) state.live = fresh.live;
    else for (const id of fresh.live.field) if (state.live.field.length < Math.min(state.team.fieldSize ?? 6, catalog.players.length) && !state.live.field.includes(id)) state.live.field.push(id);
  }
  const mergeRound = round => Object.fromEntries(catalog.matches.map(m => [m.id, { ...fresh.availability[m.id], ...round[m.id] }]));
  state.availability = mergeRound(state.availability);
  state.rounds = state.rounds.map(round => Object.fromEntries(Object.entries(round).map(([id, responses]) => [id, {...fresh.availability[id], ...responses}])));
  const completed = [...new Set(state.stats.map(r => r.matchId))];
  for (const matchId of completed) for (const player of catalog.players) if (!state.stats.some(r => r.matchId === matchId && r.playerId === player.id)) state.stats.push({ matchId, playerId: player.id, present: false, minutes: 0, keeperMinutes: 0, goals: 0 });
  state.team.periods = periods;
  state.catalog = catalog;
  parseState(JSON.stringify(state));
  return { state, revision: Number(chunks[0].revision), sourceToken: teamSourceToken(snapshot, teamSeasonId) };
}
export function stateTables(snapshot, teamSeasonId, state, revision) {
  const keepOthers = name => snapshot.tables[name].filter(r => r.teamSeasonId !== teamSeasonId);
  const json = JSON.stringify(state);
  const chunks = [];
  for (let i = 0; i < json.length; i += 30000) chunks.push({ teamSeasonId, revision, part: chunks.length, json: json.slice(i, i + 30000) });
  const seasonId = state.catalog.seasonId;
  let profilesChanged=false;
  const sourcePlayers=snapshot.tables.Players.map(row=>{
    if(row.teamSeasonId!==teamSeasonId)return row;
    const profile=state.catalog.players.find(p=>p.id===row.playerId)?.substitutionProfile??null;
    const old=row.substitutionProfile?JSON.parse(row.substitutionProfile):null;
    if(JSON.stringify(old)===JSON.stringify(profile))return row;
    profilesChanged=true;return {...row,substitutionProfile:profile?JSON.stringify(profile):''};
  });
  const availability = Object.entries(state.availability).flatMap(([matchId, responses]) => Object.entries(responses).map(([playerId, status]) => ({teamSeasonId, seasonId, round: state.catalog.matches.find(m => m.id === matchId).availabilityRound, matchId, playerId, status})));
  return {
    ...(profilesChanged?{Players:sourcePlayers}:{}),
    Matches: [...snapshot.tables.Matches.map(row => {
      const m=row.teamSeasonId===teamSeasonId ? state.catalog.matches.find(m=>m.id===row.matchId) : null;
      return m ? {...row,pool:m.pool,date:m.date,shortDate:m.shortDate,time:m.time,opponent:m.opponent,venue:m.venue,availabilityRound:m.availabilityRound} : row;
    }), ...state.catalog.matches.filter(m=>!snapshot.tables.Matches.some(row=>row.teamSeasonId===teamSeasonId&&row.matchId===m.id)).map(m=>({...m,teamSeasonId,matchId:m.id}))],
    State: [...keepOthers('State'), ...chunks],
    Availability: [...keepOthers('Availability'), ...availability],
    MatchStats: [...keepOthers('MatchStats'), ...state.stats.map(row => ({ teamSeasonId, seasonId, ...row, minutes: row.minutesKnown === false ? "" : row.minutes, keeperMinutes: row.keeperMinutesKnown === false ? "" : row.keeperMinutes, minutesKnown: row.minutesKnown !== false, keeperMinutesKnown: row.keeperMinutesKnown !== false }))],
    TeamSeasons: snapshot.tables.TeamSeasons.map(t => t.teamSeasonId === teamSeasonId ? { ...t, periods: state.team.periods, liveMatchId: state.catalog.liveMatchId } : t),
  };
}



