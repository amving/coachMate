import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {fingerprint, loadTeam, SheetsStore} from '../server/sheets.mjs';
import {schema} from '../server/schema.mjs';
import {goalsOnlyMatch, individualStatsRows, recordedMatchResult, scoreInVenueOrder, teamMatchMinutes, totalGoals} from '../src/coach-state.ts';
import {processedMatchIds, seasonGoalRows} from '../src/result-only.ts';

const core = ['Seasons','TeamSeasons','Players','Matches','State','Availability','MatchStats'];
const contacts = new Set(['parent','parentName','parentEmail','parentPhone']);
const redact = (key, value) => contacts.has(key) ? key==='parent' ? '' : undefined : value;
const rowKey = index => String(index).padStart(6,'0');

// Use the production workbook parser with an already captured, read-only value grid.
export async function parseCapture(capture) {
  const names=Object.keys(schema);
  assert.ok(core.every(table=>Array.isArray(capture?.tabs?.[table]?.[0])), 'De opname mist een verplicht tabblad.');
  const grids=names.map(name=>core.includes(name)?capture.tabs[name]:[schema[name]]);
  const sheets=names.map((title,sheetId)=>({properties:{
    title,sheetId,gridProperties:{rowCount:Math.max(1,grids[sheetId].length),columnCount:grids[sheetId][0].length},
  }}));
  const reader=new SheetsStore({request:async ({url})=>({data:url.endsWith('/values:batchGet')?
    {valueRanges:grids.map(values=>({values}))}:{sheets}})},'read-only-capture');
  const parsed=await reader.read();
  const tables=Object.fromEntries(core.map(name=>[name,parsed.tables[name]]));
  tables.Players=tables.Players.map(player=>JSON.parse(JSON.stringify(player,redact)));
  const teams=new Map();
  for(const part of tables.State){
    const parts=teams.get(part.teamSeasonId)??[];
    parts.push(part);teams.set(part.teamSeasonId,parts);
  }
  tables.State=[];
  for(const parts of teams.values()){
    parts.sort((a,b)=>Number(a.part)-Number(b.part));
    assert.ok(parts.every((entry,index)=>Number(entry.part)===index&&entry.revision===parts[0].revision),
      'De bron bevat onvolledige State-delen.');
    const safe=JSON.stringify(JSON.parse(parts.map(part=>part.json).join('')),redact);
    for(let start=0,part=0;start<safe.length;part++){
      let end=Math.min(start+30_000,safe.length);
      const last=safe.charCodeAt(end-1);
      if(end<safe.length&&last>=0xd800&&last<=0xdbff)end--;
      const {teamSeasonId,revision}=parts[0];
      tables.State.push({teamSeasonId,revision,part,json:safe.slice(start,end)});
      start=end;
    }
  }
  assert.ok(tables.TeamSeasons.length, 'De opname bevat geen teamseizoenen.');
  return tables;
}

export function summarizeHistory(tables) {
  return tables.TeamSeasons.map(team=>{
    const {state,revision}=loadTeam({tables},team.teamSeasonId);
    const processed=processedMatchIds(state);
    const individual=individualStatsRows(state);
    const scoring=seasonGoalRows(state);
    const matches=state.catalog.matches.map(match=>{
      const result=recordedMatchResult(state,match.id);
      const rows=state.stats.filter(row=>row.matchId===match.id);
      const availability=state.availability[match.id];
      return {
        id:match.id,date:match.date,venue:match.venue,round:match.availabilityRound,opponent:match.opponent,
        processed:processed.has(match.id),result,displayScore:result?scoreInVenueOrder(match,result.goalsFor,result.goalsAgainst):null,
        resultOnly:state.resultOnly?.[match.id]??null,liveArchive:state.liveArchive?.[match.id]??null,
        availability,rows,
      };
    });
    const results=matches.flatMap(match=>match.processed&&match.result?[match.result]:[]);
    const wins=results.filter(result=>result.goalsFor>result.goalsAgainst).length;
    const draws=results.filter(result=>result.goalsFor===result.goalsAgainst).length;
    const goalsAgainst=results.reduce((sum,result)=>sum+result.goalsAgainst,0);
    const goalsFor=results.reduce((sum,result)=>sum+result.goalsFor,0);
    return {
      teamSeasonId:team.teamSeasonId,revision,seasonId:team.seasonId,archived:state.catalog.archived,
      played:processed.size,knownScores:results.length,wins,draws,losses:results.length-wins-draws,points:3*wins+draws,
      goalsFor,goalsAgainst,goalDifference:goalsFor-goalsAgainst,teamGoalsInApp:totalGoals(state),
      playerGoals:scoring.reduce((sum,row)=>sum+row.goals,0),
      teamMinutes:teamMatchMinutes(state),resultOnlyMatches:matches.filter(match=>match.resultOnly).length,
      resultOnlyDetails:matches.filter(match=>match.resultOnly).map(({date,venue,opponent,displayScore,resultOnly,rows})=>({
        date,venue,opponent,displayScore,events:resultOnly.events.length,
        unknownGoalMinutes:resultOnly.events.filter(event=>event.minute===null).length,individualRows:rows.length,
      })),
      unknownPlayingRows:individual.filter(row=>row.minutesKnown===false).length,
      unknownKeeperRows:individual.filter(row=>row.keeperMinutesKnown===false).length,
      matchesWithoutCountedAttendance:matches.filter(match=>match.processed&&(!match.rows.some(row=>typeof row.present==='boolean')||goalsOnlyMatch(state,match.id))).length,
      detailHash:fingerprint({matches,scoring,rounds:state.rounds,formUpdates:state.formUpdates}),
    };
  });
}

function emulatorConnection(host, project) {
  if(!/^127\.0\.0\.1:[1-9]\d{0,4}$/.test(host??'')||!/^demo-[a-z][a-z0-9-]{3,50}$/.test(project??'')){
    throw new Error('Gebruik alleen een lokale Firestore-emulator op 127.0.0.1 en een demo-project.');
  }
  const root='projects/'+project+'/databases/(default)/documents';
  const base='http://'+host+'/v1/'+root;
  async function request(path,data){
    const response=await fetch(base+path,{headers:{Authorization:'Bearer owner','Content-Type':'application/json'},
      ...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)}),redirect:'error',signal:AbortSignal.timeout(20_000)});
    if(!response.ok)throw new Error('Firestore-emulator antwoordde met HTTP '+response.status+'.');
    return response.json();
  }
  return {root,request};
}

export async function rehearseMigration(capture, config) {
  const connection=emulatorConnection(config.host,config.project);
  const source=await parseCapture(capture);
  const history=summarizeHistory(source);
  const sourceHash=fingerprint(source), run='migrationRuns/'+sourceHash;
  for(const table of core){
    const rows=source[table];
    for(let start=0;start<rows.length;start+=100){
      const writes=rows.slice(start,start+100).map((row,index)=>({update:{
        name:connection.root+'/'+run+'/'+table+'/'+rowKey(start+index),
        fields:{payload:{stringValue:JSON.stringify(row)}},
      }}));
      // The source hash selects an immutable namespace, so reruns write the same rows.
      await connection.request(':commit',{writes});
    }
  }
  const saved={};
  for(const table of core){
    const docs=[];
    let pageToken='';
    do{
      const query=new URLSearchParams({pageSize:'100',...(pageToken?{pageToken}:{})});
      const result=await connection.request('/'+run+'/'+table+'?'+query);
      docs.push(...(result.documents??[]));pageToken=result.nextPageToken;
    }while(pageToken);
    docs.sort((a,b)=>a.name.localeCompare(b.name));
    assert.ok(docs.every((doc,i)=>doc.name.endsWith('/'+rowKey(i))), 'Afwijkende documentnummers in '+table+'.');
    saved[table]=docs.map(doc=>JSON.parse(doc.fields.payload.stringValue));
    assert.equal(fingerprint(saved[table]),fingerprint(source[table]),'Bronafwijking in '+table+'.');
  }
  const verified=summarizeHistory(saved);
  assert.deepEqual(verified,history,'Historische cijfers wijken af van de bron.');
  const report={run:sourceHash,sourceCapturedAt:capture.capturedAt??null,project:config.project,
    verified:true,rows:Object.fromEntries(core.map(table=>[table,saved[table].length])),teams:verified};
  await connection.request(':commit',{writes:[{update:{name:connection.root+'/'+run,
    fields:{verification:{stringValue:JSON.stringify(report)}}}}]});
  const manifest=await connection.request('/'+run);
  assert.deepEqual(JSON.parse(manifest.fields.verification.stringValue),report);
  return report;
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  try{
    const [, , input, project]=process.argv;
    if(!input||!project)throw new Error('Gebruik: node --experimental-strip-types scripts/firestore-history-pilot.mjs <opname.json> <demo-project>');
    const capture=JSON.parse(await readFile(input,'utf8'));
    const result=await rehearseMigration(capture,{project,host:process.env.FIRESTORE_EMULATOR_HOST});
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch(error){
    process.stderr.write((error instanceof SyntaxError?'Ongeldige JSON in de opname of testdatabase.':error.message)+'\n');
    process.exitCode=1;
  }
}
