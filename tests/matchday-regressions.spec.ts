import {test,expect,type Page} from '@playwright/test';
import {createTeamState,demoCatalog,type CoachState} from '../src/coach-state';
import {applyActionBatch} from '../src/action-batch';

test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
test.setTimeout(60000);
const nav=(page:Page,name:string)=>page.getByRole('navigation').getByRole('button',{name,exact:true});
function fixture():CoachState {
 const c=demoCatalog();c.matches=[{...c.matches[0],id:'past',date:'2030-11-01',availabilityRound:2},{...c.matches[1],id:'next',date:'2030-11-08',availabilityRound:2}];c.liveMatchId='next';
 const s=createTeamState(c,4,6);s.availability=Object.fromEntries(c.matches.map(m=>[m.id,Object.fromEntries(c.players.map(p=>[p.id,'available' as const]))]));
 s.stats=c.players.map(p=>({matchId:'past',playerId:p.id,present:true,minutes:30,keeperMinutes:p.id==='p01'?25:0,goals:0,...(p.id==='p10'?{targetMinutes:1973750/60000}:{})}));return s;
}
async function open(page:Page,s=fixture(),connectionError=false){
 await page.clock.setFixedTime(new Date('2030-11-07T09:00:00Z'));
 await page.route('http://127.0.0.1:4175/**',r=>connectionError?r.fulfill({status:503,json:{error:'De bron kan tijdelijk niet worden geladen. Je lokale wedstrijd blijft bewaard; vernieuw de gegevens of controleer de instellingen.'}}):r.fulfill({json:{configured:false,authenticated:false}}));
 await page.addInitScript(s=>{if(!localStorage.getItem('coachmate:v1'))localStorage.setItem('coachmate:v1',JSON.stringify(s));},s);
 await page.goto('/?device=real');
}
const stored=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('coachmate:v1')!) as CoachState);
async function prepare(page:Page){
 await nav(page,'Overzicht').tap();await page.getByRole('button',{name:'Spelersgroep en wisselplan',exact:true}).tap();
 await page.getByRole('button',{name:'Bevestigen en verder',exact:true}).tap();
 for(const [i,id] of ['p01','p01','p02','p02'].entries())await page.getByLabel(`Keeper kwart ${i+1}`,{exact:true}).selectOption(id);
 await page.getByRole('button',{name:'Wisselplan berekenen',exact:true}).tap();
 await page.getByRole('button',{name:'Startopstelling invullen',exact:true}).tap();
 await page.getByRole('button',{name:'Voorgestelde opstelling overnemen',exact:true}).tap();
 await page.getByRole('button',{name:'Bevestigen en naar Live',exact:true}).tap();
 await expect(page.getByRole('dialog')).toHaveCount(0);
}
test('touch journey from historical targets through preparation, live goal, undo and reload',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const original=fixture();await open(page,original);await prepare(page);
 await expect(page.getByRole('button',{name:'Start',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Goal voor Speler of eigen doelpunt',exact:true}).tap();
 await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Kies Daan',exact:true}).tap();
 const register=page.getByRole('button',{name:/^Registreer · Daan ·/});await expect(register).toBeEnabled();await register.tap();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByTestId('score')).toHaveText('0 – 1');
 expect((await stored(page)).live.goals).toHaveLength(1);expect((await stored(page)).stats).toEqual(original.stats);
 await page.reload();await nav(page,'Live').tap();await expect(page.getByTestId('score')).toHaveText('0 – 1');
 await page.getByRole('button',{name:'Laatste goal terug',exact:true}).tap();await expect(page.getByTestId('score')).toHaveText('0 – 0');expect(errors).toEqual([]);
});
test('goal and opponent confirmation stay reachable with touch on a short screen',async({page})=>{
 await page.setViewportSize({width:320,height:640});await open(page);await nav(page,'Live').tap();
 await page.getByRole('button',{name:'Goal voor Speler of eigen doelpunt',exact:true}).tap();await page.getByRole('button',{name:'Kies Daan',exact:true}).tap();
 await page.getByRole('button',{name:/^Registreer · Daan ·/}).tap();await expect(page.getByTestId('score')).toHaveText('0 – 1');
 await page.getByRole('button',{name:'Tegengoal Tegenstander of eigen doelpunt',exact:true}).tap();await page.getByRole('button',{name:/^Registreer · 1–1$/}).tap();await expect(page.getByTestId('score')).toHaveText('1 – 1');
});
test('a source warning leaves the Goal opener reachable on a phone',async({page})=>{
 await open(page,fixture(),true);await nav(page,'Live').tap();await expect(page.getByRole('button',{name:'Melding sluiten',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Goal voor Speler of eigen doelpunt',exact:true}).tap({timeout:5000});await expect(page.getByRole('dialog')).toBeVisible();
});
for(const venue of ['Thuis','Uit'] as const)test(`${venue}: substitution, both own goals and final statistics retain attribution`,async({page})=>{
 const initial=fixture();initial.catalog!.matches.find(m=>m.id==='next')!.venue=venue;await open(page,initial);await nav(page,'Live').tap();
 await page.getByText('Wisselen zonder slepen',{exact:true}).tap();await page.getByLabel('Speler uit het veld',{exact:true}).selectOption('p02');await page.getByLabel('Speler van de bank',{exact:true}).selectOption('p08');await page.getByRole('button',{name:'Spelers wisselen',exact:true}).tap();
 await page.getByRole('button',{name:'Goal voor Speler of eigen doelpunt',exact:true}).tap();await expect(page.getByRole('button',{name:'Kies Mats',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Kies Lucas',exact:true}).tap();await page.getByRole('button',{name:/^Registreer · Lucas ·/}).tap();
 await page.getByRole('button',{name:'Tegengoal Tegenstander of eigen doelpunt',exact:true}).tap();await page.getByRole('button',{name:'Eigen doelpunt van ons team',exact:true}).tap();await page.getByRole('button',{name:'Kies Daan',exact:true}).tap();await page.getByRole('button',{name:/^Registreer · Daan ·/}).tap();
 await page.getByRole('button',{name:'Goal voor Speler of eigen doelpunt',exact:true}).tap();await page.getByRole('button',{name:'Eigen doelpunt tegenstander',exact:true}).tap();await page.getByRole('button',{name:/^Registreer · [12]–[12]$/}).tap();await expect(page.getByTestId('score')).toHaveText(venue==='Thuis'?'2 – 1':'1 – 2');
 await page.getByRole('button',{name:'Wedstrijddata verwerken',exact:true}).tap();await page.getByRole('button',{name:'Afsluiten en verwerken',exact:true}).tap();
 const saved=await stored(page);expect(saved.live.phase).toBe('Einde');expect(saved.live.swaps).toHaveLength(1);expect(saved.live.goals).toHaveLength(2);expect(saved.live.awayGoals[0]).toMatchObject({ownGoal:true,playerId:'p01'});expect(saved.stats.find(r=>r.matchId==='next'&&r.playerId==='p08')!.goals).toBe(1);expect(saved.stats.find(r=>r.matchId==='next'&&r.playerId==='p01')!.goals).toBe(0);expect(saved.stats.filter(r=>r.matchId==='past')).toEqual(initial.stats);
 await expect(page.getByRole('link',{name:'Open in WhatsApp',exact:true})).toBeVisible();await page.reload();await nav(page,'Live').tap();await expect(page.getByTestId('score')).toHaveText(venue==='Thuis'?'2 – 1':'1 – 2');expect((await stored(page)).stats).toEqual(saved.stats);
});
for(const lostResponse of [false,true])test(`pending Google save: Goal opens and retains the scorer (${lostResponse?'lost response and retry':'successful response'})`,async({page})=>{
 const initial=fixture(),distribution={forms:[],invites:[],jobs:[],deliveries:[],mailReady:false};let release=()=>{};const uploaded:any[]=[];
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('http://127.0.0.1:4175/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/action-batch'){
   const input=route.request().postDataJSON();uploaded.push(input);await gate;const saved=applyActionBatch(initial,input.actions);saved.committedBatches=[input.batchId];if(lostResponse&&uploaded.length===1){await route.fulfill({status:502,json:{error:'Test: opslagantwoord verloren'}});return;}await route.fulfill({json:{state:saved,revision:2,sourceToken:'saved',distribution}});return;
  }
  await route.fulfill({json:path==='/api/session'?{configured:true,authenticated:true,email:'coach@example.test',csrf:'test'}:path==='/api/teams'?{state:initial,revision:1,sourceToken:'original',teams:[{teamSeasonId:initial.catalog!.teamSeasonId,seasonId:initial.catalog!.seasonId,teamName:'Testteam'}],seasons:[],distribution}:distribution});
 });
 try{
  await page.goto('/?device=real');await nav(page,'Live').tap();
  await page.getByRole('button',{name:'Goal voor Speler of eigen doelpunt',exact:true}).tap();await page.getByRole('button',{name:'Kies Daan',exact:true}).tap();await page.getByRole('button',{name:/^Registreer · Daan ·/}).tap();
  await page.getByRole('button',{name:'Tussentijds opslaan',exact:true}).tap();await expect.poll(()=>uploaded.length).toBe(1);
  const goal=page.getByRole('button',{name:'Goal voor Speler of eigen doelpunt',exact:true});await expect(goal).toBeEnabled();await goal.tap();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Kies Daan',exact:true}).tap();await expect(page.getByRole('button',{name:/^Registreer · Daan ·/})).toBeDisabled();
  release();
  if(lostResponse){await expect(page.getByRole('button',{name:/^Registreer · Daan ·/})).toBeDisabled();await page.getByRole('button',{name:'Eerdere wijzigingen opslaan',exact:true}).tap();await expect(page.getByRole('button',{name:/^Registreer · Daan ·/})).toBeEnabled();expect(uploaded[0].batchId).toBe(uploaded[1].batchId);expect(uploaded[0].actions).toEqual(uploaded[1].actions);}
  await page.getByRole('button',{name:/^Registreer · Daan ·/}).tap();await expect(page.getByTestId('score')).toHaveText('0 – 2');expect(uploaded).toHaveLength(lostResponse?2:1);expect(uploaded[0].actions).toHaveLength(1);
 }finally{release();}
});
