import {test,expect,type Page} from '@playwright/test';
import {createTeamState,demoCatalog,type CoachState} from '../src/coach-state';
import {coachReducer} from '../src/coach-state';
import {adviceFor} from '../src/substitution/recommendations';
import {nextAdvice} from '../src/substitution/recommendations';
import {applyActionBatch} from '../src/action-batch';
import {journalKey} from '../src/local-cache';
test.use({viewport:{width:390,height:844}});
test.setTimeout(60000);
function fixture(){const catalog={...demoCatalog(),players:Array.from({length:11},(_,i)=>({id:`p${i}`,name:`Speler ${i}`,shortName:`S${i}`,parent:'',number:i+1,position:'',substitutionProfile:{goalkeeperEligible:i<3}})),liveMatchId:'test-match',matches:[{...demoCatalog().matches[0],id:'test-match',date:'2026-10-18'}]};const s=createTeamState(catalog,4,8);s.availability['test-match']=Object.fromEntries(catalog.players.map(p=>[p.id,'available' as const]));s.live.preparation={confirmedAt:0,presentIds:catalog.players.map(p=>p.id),keeperIds:['p0','p1','p2'],startingKeeperId:'p0'};s.live.elapsedMs=1;s.live.periodTimes={'4:1':1};s.live.played=Object.fromEntries(catalog.players.map(p=>[p.id,{milliseconds:s.live.field.includes(p.id)?1:0,keeperMilliseconds:p.id==='p0'?1:0}]));s.live.occupancy=[{startMs:0,endMs:1,field:[...s.live.field],keeperId:'p0'}];return s;}
const stored=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('coachmate:v1')!));
const nav=(page:Page,name:string)=>page.getByRole('navigation').getByRole('button',{name,exact:true});
async function open(page:Page,state=fixture()) {await page.route('http://127.0.0.1:4175/**',r=>r.fulfill({json:{configured:false,authenticated:false}}));await page.addInitScript(s=>{if(!localStorage.getItem('coachmate:v1'))localStorage.setItem('coachmate:v1',JSON.stringify(s));},state);await page.goto('/?device=real',{waitUntil:'domcontentloaded'});await nav(page,'Live').click();}
async function plan(page:Page){await page.getByRole('button',{name:'Wisselplan maken',exact:true}).click();const sheet=page.getByRole('dialog',{name:'Wisselplan',exact:true});await expect(sheet).toBeVisible();return sheet;}

test('plan review, explicit acceptance and execution produce one atomic swap then a fresh proposal',async({page})=>{
 await open(page);const before=await stored(page),sheet=await plan(page);
 await expect(sheet.getByRole('button',{name:'Wissel als uitgevoerd registreren',exact:true})).toBeDisabled();
 await sheet.getByRole('button',{name:'Advies accepteren',exact:true}).click();
 expect((await stored(page)).live.field).toEqual(before.live.field);expect((await stored(page)).live.swaps).toHaveLength(0);
 const old=(await stored(page)).assistant['test-match'].plan.id;
 await sheet.getByRole('button',{name:'Wissel als uitgevoerd registreren',exact:true}).click();
 await expect(sheet).toHaveCount(0);await expect.poll(async()=>(await stored(page)).assistant['test-match'].plan.id).not.toBe(old);
 const after=await stored(page);expect(after.assistant['test-match'].status).toBe('proposed');expect(after.live.field).toHaveLength(8);expect(new Set(after.live.field).size).toBe(8);expect(after.live.field).toContain(after.live.keeperId);expect(after.assistant['test-match'].events.filter((e:any)=>e.kind==='executed')).toHaveLength(1);
 await page.reload({waitUntil:"domcontentloaded"});await nav(page,'Live').click();expect((await stored(page)).live.swaps).toEqual(after.live.swaps);
 await page.screenshot({path:'outputs/phase-3-assistant-live.png'});
});
test('skip persists through tabs and reload; clock ticks alone do not replace an accepted plan',async({page})=>{
 await page.clock.install({time:new Date('2026-10-18T10:00:00Z')});await open(page);const sheet=await plan(page);await sheet.getByRole('button',{name:'Advies accepteren',exact:true}).click();const id=(await stored(page)).assistant['test-match'].plan.id;await sheet.getByRole('button',{name:'Sluiten',exact:true}).click();await page.getByRole('button',{name:'Start',exact:true}).click();await page.clock.fastForward(10000);expect((await stored(page)).assistant['test-match'].plan.id).toBe(id);
 await page.getByRole('button',{name:'Plan en uitleg bekijken',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Overslaan',exact:true}).click();await page.getByRole('button',{name:'Sluiten',exact:true}).click();await nav(page,'Statistieken').click();await nav(page,'Live').click();await expect(page.locator('.assistant-status')).toContainText('overgeslagen');await page.reload({waitUntil:"domcontentloaded"});await nav(page,'Live').click();expect((await stored(page)).assistant['test-match'].status).toBe('skipped');
});
test('a manual substitution automatically prepares another suggestion without executing it',async({page})=>{
 await open(page);const sheet=await plan(page);await sheet.getByRole('button',{name:'Sluiten',exact:true}).click();const old=(await stored(page)).assistant['test-match'].plan.id;
 await page.getByText('Wisselen zonder slepen',{exact:true}).click();
 const selects=page.locator('.substitution-fallback select');await expect(selects).toHaveCount(2);
 await selects.nth(0).selectOption('p7');await selects.nth(1).selectOption('p10');await page.locator('.substitution-fallback').getByRole('button',{name:'Spelers wisselen',exact:true}).click();
 await expect.poll(async()=>(await stored(page)).assistant['test-match'].plan.id).not.toBe(old);const state=await stored(page);expect(state.live.swaps).toHaveLength(1);expect(state.assistant['test-match'].status).toBe('proposed');
});
test('assistant settings keep a local draft; save persists weights, keepers and policy version',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Instellingen openen',exact:true}).click();await page.getByText('AI-wisselassistent',{exact:true}).click();
 await page.getByLabel('Gewicht eerlijke speeltijd',{exact:true}).fill('60');await page.getByLabel('Gewicht wisselrotatie',{exact:true}).fill('20');await page.getByLabel('Gewicht tactische kwaliteit',{exact:true}).fill('20');
 expect((await stored(page)).team.substitutionPolicy).toBeUndefined();await page.reload({waitUntil:"domcontentloaded"});await page.getByRole('button',{name:'Instellingen openen',exact:true}).click();await page.getByText('AI-wisselassistent',{exact:true}).click();await expect(page.getByLabel('Gewicht eerlijke speeltijd',{exact:true})).toHaveValue('60');
 await page.getByRole('button',{name:'Wisselinstellingen opslaan',exact:true}).click();await expect(page.getByText('Instellingen bewaard · beleid v1',{exact:true})).toBeVisible();const state=await stored(page);expect(state.team.substitutionPolicy.weights).toEqual({fairness:.6,rotation:.2,tactical:.2});expect(state.catalog.players.filter((p:any)=>p.substitutionProfile.goalkeeperEligible)).toHaveLength(3);
 await page.screenshot({path:'outputs/phase-3-assistant-settings.png'});
});
test('missing confirmations explain why a plan is disabled, without inventing availability',async({page})=>{
 const state=fixture();state.availability['test-match'].p4='pending';await open(page,state);await expect(page.getByRole('button',{name:'Wisselplan maken',exact:true})).toBeDisabled();await expect(page.locator('.assistant-warning')).toContainText('Bevestig de aanwezige spelers');expect((await stored(page)).assistant).toBeUndefined();
});
test('manual plan adjustment changes projected occupancy and requires acceptance again',async({page})=>{
 await open(page);const sheet=await plan(page);const before=await stored(page),change=nextAdvice(before as CoachState)!;
 await sheet.getByRole('button',{name:'Aanpassen',exact:true}).click();const outgoing=change.field.find(id=>id!==change.keeperId)!,incoming=before.catalog.players.find((p:any)=>!change.field.includes(p.id)).id;
 await sheet.getByLabel(before.catalog.players.find((p:any)=>p.id===outgoing).name,{exact:true}).uncheck();await sheet.getByLabel(before.catalog.players.find((p:any)=>p.id===incoming).name,{exact:true}).check();
 await sheet.getByRole('button',{name:'Aangepast voorstel bewaren',exact:true}).click();const after=await stored(page);expect(after.live.field).toEqual(before.live.field);expect(after.assistant['test-match'].status).toBe('proposed');expect(after.assistant['test-match'].plan.reasonCodes).toContain('MANUAL_ADJUSTMENT');expect(after.assistant['test-match'].plan.id).not.toBe(before.assistant['test-match'].plan.id);
 await expect(sheet.getByRole('button',{name:'Wissel als uitgevoerd registreren',exact:true})).toBeDisabled();
});
test('Google advice stays local until explicit save; a failed upload retains the same retry batch',async({page})=>{
 const base=fixture();let posts=0;const account='coach@example.test';const key=journalKey(account,base.catalog!.teamSeasonId);
 await page.route('http://127.0.0.1:4175/**',async route=>{const url=new URL(route.request().url());let data:any={forms:[],invites:[]};if(url.pathname==='/api/session')data={configured:true,authenticated:true,email:account,csrf:'test'};if(url.pathname==='/api/teams')data={teams:[{teamSeasonId:base.catalog!.teamSeasonId,seasonId:base.catalog!.seasonId,teamName:'Team'}],seasons:[{seasonId:base.catalog!.seasonId,name:'Season',archived:false}]};if(url.pathname==='/api/state')data={state:base,revision:1,sourceToken:'one'};
 if(url.pathname==='/api/action-batch'){posts++;if(posts===1){await route.fulfill({status:503,json:{error:'Tijdelijk offline'}});return;}const input=route.request().postDataJSON();const saved=applyActionBatch(base,input.actions);saved.committedBatches=[input.batchId];data={state:saved,revision:2,sourceToken:'two'};}await route.fulfill({json:data});});
 await page.goto('/?device=real',{waitUntil:'domcontentloaded'});await expect(page.locator('.coach-app')).toHaveAttribute('data-source','google');await nav(page,'Live').click();const sheet=await plan(page);await sheet.getByRole('button',{name:'Advies accepteren',exact:true}).click();expect(posts).toBe(0);const before=JSON.parse((await page.evaluate(k=>localStorage.getItem(k),key))!);expect(before.actions.map((a:any)=>a.type)).toEqual(['assistant-plan','assistant-decision']);
 await sheet.getByRole('button',{name:'Sluiten',exact:true}).click();await page.getByRole('button',{name:'Tussentijds opslaan',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Tijdelijk offline');const failed=JSON.parse((await page.evaluate(k=>localStorage.getItem(k),key))!);expect(failed.id).toBe(before.id);expect(failed.actions).toEqual(before.actions);
 await page.getByRole('button',{name:'Opnieuw opslaan',exact:true}).click();await expect.poll(()=>page.evaluate(k=>localStorage.getItem(k),key)).toBeNull();expect(posts).toBe(2);
});
test('reminder is driven by active playing time and defer waits two active minutes before replanning',async({page})=>{
 await page.clock.install({time:new Date('2026-10-18T10:00:00Z')});await open(page);const sheet=await plan(page);await sheet.getByRole('button',{name:'2 min uitstellen',exact:true}).click();const old=(await stored(page)).assistant['test-match'].plan.id;
 await sheet.getByRole('button',{name:'Sluiten',exact:true}).click();await page.getByRole('button',{name:'Start',exact:true}).click();await page.clock.fastForward(119000);expect((await stored(page)).assistant['test-match'].plan.id).toBe(old);await page.clock.fastForward(2000);await expect.poll(async()=>(await stored(page)).assistant['test-match'].plan.id).not.toBe(old);
 const current=await stored(page),stateField=current.live.field;
 const at=current.assistant['test-match'].plan.intervals.find((s:any)=>s.field.some((id:string)=>!stateField.includes(id)))?.startMs;
 expect(at).toBeDefined();if(at-current.live.elapsedMs>30000)await page.clock.fastForward(at-current.live.elapsedMs-20000);await expect(page.locator('.assistant-reminder')).toBeVisible();
});
