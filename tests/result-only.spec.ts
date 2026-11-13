import {test,expect,type Page} from '@playwright/test';
import {createTeamState,demoCatalog,type CoachState} from '../src/coach-state';
import {parseScoreEvents} from '../src/result-only';
import {applyActionBatch} from '../src/action-batch';
test.use({viewport:{width:390,height:844}});
const nav=(page:Page,name:string)=>page.getByRole('navigation').getByRole('button',{name,exact:true});
function fixture(){const c=demoCatalog();c.teamName='Testteam';c.matches=c.matches.map(m=>({...m,availabilityRound:2}));const s=createTeamState(c,4,6);s.stats=[];return s;}
async function open(page:Page,s:CoachState){await page.route('http://127.0.0.1:4175/**',r=>r.fulfill({json:{configured:false,authenticated:false}}));await page.addInitScript(s=>{if(!localStorage.getItem('coachmate:v1'))localStorage.setItem('coachmate:v1',JSON.stringify(s));},s);await page.goto('/?device=real');await nav(page,'Statistieken').click();}
async function entry(page:Page){await page.getByRole('button',{name:'Bekijk en corrigeer historische wedstrijdgegevens',exact:true}).click();await page.getByRole('button',{name:'Wedstrijd invoeren',exact:true}).click();await page.getByRole('button',{name:'Alleen uitslag en scoreverloop',exact:true}).click();}
const readState=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('coachmate:v1')!) as CoachState);
test('save/reload result and exact score snapshots without introducing attendance or minutes',async({page})=>{
 const s=fixture(),id=s.catalog!.matches[0].id;await open(page,s);await entry(page);
 await expect(page.getByRole('button',{name:'Daan aanwezig',exact:true})).toHaveCount(0);
 await page.getByLabel('Eindstand eigen team',{exact:true}).fill('2');await page.getByLabel('Eindstand tegenstander',{exact:true}).fill('3');await page.getByLabel('Chronologisch scoreverloop').fill('0-3\n1-3 Mats\n2-3 Siem');await page.getByRole('button',{name:'Opslaan',exact:true}).click();
 const stored=await readState(page);expect(stored.stats).toEqual(s.stats);expect(stored.availability).toEqual(s.availability);expect(stored.live).toEqual(s.live);expect(stored.resultOnly![id].events).toHaveLength(3);expect(stored.resultOnly![id].events.every(e=>e.minute===null)).toBe(true);
 await nav(page,'Statistieken').click();await expect(page.getByLabel('Cumulatieve statistieken')).toContainText('1 wedstrijden');await expect(page.getByTestId('season-match-minutes')).toHaveText('?');await expect(page.getByRole('button',{name:'Statistieken Mats',exact:true})).toContainText('1goals');
 await page.getByLabel('Rangschik op',{exact:true}).selectOption('attendance');await expect(page.locator('.rank-number').first()).toHaveText('–');await expect(page.locator('.rank-value').first()).toHaveText('—wedstrijden');
 await page.reload();await nav(page,'Statistieken').click();await page.getByRole('button',{name:'Bekijk en corrigeer historische wedstrijdgegevens',exact:true}).click();await page.locator('.history-row').filter({hasText:s.catalog!.matches[0].opponent}).click();await expect(page.getByLabel('Chronologisch scoreverloop')).toHaveValue('0-3\n1-3 Mats\n2-3 Siem');
 await page.screenshot({path:'outputs/result-only-entry.png',fullPage:true});
});
test('incomplete and conflicting input stays as a local scoped draft across tab changes and reloads',async({page})=>{
 const s=fixture();await open(page,s);await entry(page);await page.getByLabel('Eindstand eigen team',{exact:true}).fill('2');await page.getByLabel('Eindstand tegenstander',{exact:true}).fill('1');await page.getByLabel('Chronologisch scoreverloop').fill('1-0 Mats');await page.getByRole('button',{name:'Opslaan',exact:true}).click();await expect(page.getByRole('alert')).toContainText('laatste tussenstand');expect((await readState(page)).resultOnly).toBeUndefined();
 await nav(page,'Overzicht').click();await nav(page,'Statistieken').click();await expect(page.getByLabel('Chronologisch scoreverloop')).toHaveValue('1-0 Mats');await page.reload();await nav(page,'Statistieken').click();await page.getByRole('button',{name:'Bekijk en corrigeer historische wedstrijdgegevens',exact:true}).click();await page.getByRole('button',{name:/Concept hervatten/}).click();await expect(page.getByLabel('Chronologisch scoreverloop')).toHaveValue('1-0 Mats');
 await page.getByLabel('Chronologisch scoreverloop').fill('1-0 Mats\n1-1\n2-1 Siem');await page.getByRole('button',{name:'Opslaan',exact:true}).click();expect(Object.keys((await readState(page)).resultOnly!)).toHaveLength(1);
});
test('saved player match details keep unknown values and archived scores remain viewable',async({page})=>{
 const s=fixture(),id=s.catalog!.matches[0].id;s.resultOnly={[id]:{goalsFor:2,goalsAgainst:3,events:parseScoreEvents('0-3\n1-3 Mats\n2-3 Siem',s.catalog!)}};s.catalog!.archived=true;s.catalog!.matches[0].venue='Uit';await open(page,s);await page.getByRole('button',{name:'Statistieken Mats',exact:true}).click();await page.locator('.profile-match').click();await expect(page.locator('.player-match-score')).toHaveText('3–2');await expect(page.locator('.match-detail-metrics dd')).toHaveText(['?','1','?','Onbekend']);await expect(page.getByRole('button',{name:'Cijfers wijzigen',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Volgende speler',exact:true}).click();await expect(page.locator('.player-match-detail')).toBeVisible();expect((await readState(page)).stats).toEqual([]);
});
test('a lost save response retries the same durable batch without registering the match twice',async({page})=>{
 const initial=fixture();initial.catalog!.teamSeasonId='test-remote-season';let saved=initial,revision=1;const requests:any[]=[];
 const distribution={forms:[],invites:[],jobs:[],deliveries:[],mailReady:false};
 await page.route('http://127.0.0.1:4175/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/action-batch'){
   const data=route.request().postDataJSON();requests.push(data);
   if(!saved.committedBatches?.includes(data.batchId)){saved=applyActionBatch(saved,data.actions);saved.committedBatches=[data.batchId];revision++;}
   if(requests.length===1){await route.fulfill({status:502,json:{error:'Test: antwoord verloren'}});return;}
   await route.fulfill({json:{state:saved,revision,sourceToken:'test-source-'+revision,distribution}});return;
  }
  const data=path==='/api/session'?{configured:true,authenticated:true,email:'coach@example.test',csrf:'test'}:path==='/api/teams'?{teams:[{teamSeasonId:initial.catalog!.teamSeasonId,teamName:'Testteam',seasonId:initial.catalog!.seasonId}],seasons:[],state:saved,revision,sourceToken:'test-source-'+revision,distribution}:path==='/api/state'?{state:saved,revision,sourceToken:'test-source-'+revision,distribution}:distribution;
  await route.fulfill({json:data});
 });
 await page.goto('/?device=real');await expect(page.locator('.coach-app')).toHaveAttribute('data-source','google');await nav(page,'Statistieken').click();await entry(page);
 await page.getByLabel('Eindstand eigen team',{exact:true}).fill('1');await page.getByLabel('Eindstand tegenstander',{exact:true}).fill('0');await page.getByLabel('Chronologisch scoreverloop').fill('1-0 Mats');await page.getByRole('button',{name:'Opslaan',exact:true}).click();
 await expect(page.locator('.result-only-entry').getByRole('alert')).toContainText('concept blijft bewaard');await expect(page.getByLabel('Chronologisch scoreverloop')).toHaveValue('1-0 Mats');
 await page.getByRole('button',{name:'Melding sluiten',exact:true}).click();await page.getByRole('button',{name:'Opslaan',exact:true}).click();await expect(page.locator('.history-screen')).toBeVisible();expect(requests).toHaveLength(2);expect(requests[0].batchId).toBe(requests[1].batchId);expect(requests[0].actions).toEqual(requests[1].actions);expect(Object.keys(saved.resultOnly!)).toHaveLength(1);expect(saved.stats).toEqual([]);expect(saved.availability).toEqual(initial.availability);expect(revision).toBe(2);
});
