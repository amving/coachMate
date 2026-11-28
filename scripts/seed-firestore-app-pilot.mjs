import {readFile} from 'node:fs/promises';
import {parseCapture, summarizeHistory} from './firestore-history-pilot.mjs';
import {appEmulator,FirestoreAppStore} from '../server/firestore-app-store.mjs';

try{
  const [,,input,project,accessInput]=process.argv;
  if(!input||!project||!accessInput)throw new Error('Gebruik: node --experimental-strip-types scripts/seed-firestore-app-pilot.mjs <opname.json> <demo-project> <coachrechten.json>');
  const access=JSON.parse(await readFile(accessInput,'utf8'));
  const tables=await parseCapture(JSON.parse(await readFile(input,'utf8')));
  if(!Array.isArray(access)||access.some(row=>typeof row?.accountId!=='string'||!row.accountId.startsWith('google:')||
    !Array.isArray(row.teams)||row.teams.some(id=>!tables.TeamSeasons.some(team=>team.teamSeasonId===id)))||
    new Set(access.map(row=>row.accountId)).size!==access.length)throw new Error('Ongeldige roltoewijzingen voor de pilot.');
  const store=new FirestoreAppStore(appEmulator({host:process.env.FIRESTORE_EMULATOR_HOST,project}));
  const expected=JSON.stringify(summarizeHistory(tables));
  await store.seed(tables);
  const saved=await store.read();
  if(JSON.stringify(summarizeHistory(saved.tables))!==expected)throw new Error('Historische cijfers wijken af in de Firestore-appdatabase.');
  for(const role of access)await store.seedCoachAccess(role.accountId,role);
  process.stdout.write('Pilot teruggelezen: '+tables.TeamSeasons.length+' teamseizoenen en '+access.length+' coachtoewijzingen.\n');
}catch(error){
  process.stderr.write(error.message+'\n');
  process.exitCode=1;
}
