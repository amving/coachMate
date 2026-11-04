import {test,expect} from '@playwright/test';
import {createInitialState,demoCatalog,coachReducer} from '../src/coach-state';
import {applyActionBatch} from '../src/action-batch';
const nav=(page:any,name:string)=>page.getByRole('navigation').getByRole('button',{name,exact:true});
async function mock(page:any){
 let state={...createInitialState(),catalog:demoCatalog()};let revision=1;let fail=true;const calls:any[]=[];
 await page.route('http://127.0.0.1:4175/**',async(route:any)=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/action-batch'){
   const body=route.request().postDataJSON();calls.push(body);
   if(!state.committedBatches?.includes(body.batchId)){state={...applyActionBatch(state,body.actions),committedBatches:[body.batchId]} as typeof state;revision++;}
   // Simulate an accepted write whose response is lost: retry must not add a goal twice.
   if(fail)return route.fulfill({status:502,json:{error:'Antwoord verloren'}});
  }
  if(path==='/api/action'){const body=route.request().postDataJSON();calls.push(body);state=coachReducer(state,body.action) as typeof state;revision++;}
  await route.fulfill({json:path==='/api/session'?{configured:true,authenticated:true,email:'cache@test',csrf:'x'}:path==='/api/teams'?{teams:[{teamSeasonId:state.catalog.teamSeasonId,seasonId:state.catalog.seasonId,teamName:'Team'}],seasons:[{seasonId:state.catalog.seasonId,name:'Seizoen',archived:false}]}:['/api/state','/api/action','/api/action-batch'].includes(path)?{state,revision,sourceToken:`token-${revision}`}:{forms:[],invites:[]}});
 });
 return {calls,succeed:()=>{fail=false;},state:()=>state};
}
test('Live actions stay local across reload and a lost acknowledgment is retried without duplicate goals',async({page})=>{
 const backend=await mock(page);await page.goto('/?device=real');await expect(page.locator('.coach-app')).toHaveAttribute('data-source','google');await nav(page,'Live').click();
 await page.getByRole('button',{name:'Goal voor Speler of eigen doelpunt',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Kies Daan',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Goal registreren',exact:true}).click();
 expect(backend.calls).toHaveLength(0);await expect(page.getByRole('region',{name:'Lokaal wedstrijdconcept'})).toContainText(/lokaal bewaard/i);
 await page.reload();await expect(page.locator('.coach-app')).toHaveAttribute('data-source','google');await expect(page.getByRole('region',{name:'Lokaal wedstrijdconcept'})).toContainText('1 wijziging');expect(backend.calls).toHaveLength(0);
 await page.getByRole('button',{name:'Tussentijds opslaan',exact:true}).click();await expect(page.getByRole('button',{name:'Opnieuw opslaan',exact:true})).toBeVisible();expect(backend.state().live.goals).toHaveLength(1);
 backend.succeed();await page.getByRole('button',{name:'Opnieuw opslaan',exact:true}).click();await expect(page.getByRole('region',{name:'Lokaal wedstrijdconcept'})).toHaveCount(0);expect(backend.calls).toHaveLength(2);expect(backend.calls[0].batchId).toBe(backend.calls[1].batchId);expect(backend.state().live.goals).toHaveLength(1);
});
test('availability popup stages several players and team settings only upload on save',async({page})=>{
 const backend=await mock(page);backend.succeed();await page.goto('/?device=real');await expect(page.locator('.coach-app')).toHaveAttribute('data-source','google');await nav(page,'Beschikbaarheid').click();await page.getByRole('button',{name:'Bekijk reacties SV De Meer',exact:true}).click();await page.getByRole('button',{name:'Aanpassen',exact:true}).click();
 await page.getByLabel('Beschikbaarheid Daan',{exact:true}).selectOption('unavailable');await page.getByLabel('Beschikbaarheid Mats',{exact:true}).selectOption('unavailable');expect(backend.calls).toHaveLength(0);
 await page.getByRole('button',{name:'Wijzigingen verwerken',exact:true}).click();await expect(page.getByText('Geen wijzigingen om te verwerken.',{exact:true})).toBeVisible();expect(backend.calls).toHaveLength(1);expect(backend.calls[0].action.changes).toEqual({p01:'unavailable',p02:'unavailable'});
 await page.getByRole('button',{name:'Sluiten',exact:true}).click();await page.getByRole('button',{name:'Instellingen openen',exact:true}).click();await page.getByText('Team en wedstrijd',{exact:true}).click();await page.getByLabel('Wedstrijdindeling',{exact:true}).selectOption('4');await page.getByLabel('Spelers op het veld',{exact:true}).selectOption('8');expect(backend.calls).toHaveLength(1);
 await page.reload();await expect(page.locator('.coach-app')).toHaveAttribute('data-source','google');await page.getByRole('button',{name:'Instellingen openen',exact:true}).click();await page.getByText('Team en wedstrijd',{exact:true}).click();await expect(page.getByLabel('Wedstrijdindeling',{exact:true})).toHaveValue('4');await expect(page.getByLabel('Spelers op het veld',{exact:true})).toHaveValue('8');
 await page.getByRole('button',{name:'Teaminstellingen opslaan',exact:true}).click();await expect(page.getByText('Geen wijzigingen om op te slaan.',{exact:true})).toBeVisible();expect(backend.calls).toHaveLength(2);expect(backend.calls[1].actions).toHaveLength(2);
});


test('failed finish keeps confirmation open and offers sharing only after retry succeeds',async({page})=>{
 const backend=await mock(page);await page.goto('/?device=real');await expect(page.locator('.coach-app')).toHaveAttribute('data-source','google');await nav(page,'Live').click();
 await page.getByRole('button',{name:'Wedstrijddata verwerken',exact:true}).click();await page.getByRole('button',{name:'Afsluiten en verwerken',exact:true}).click();
 await expect.poll(()=>backend.calls.length).toBe(1);await expect(page.getByRole('button',{name:'Afsluiten en verwerken',exact:true})).toBeEnabled();
 await expect(page.getByRole('link',{name:'Open in WhatsApp',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Deel eindstand via WhatsApp',exact:true})).toHaveCount(0);
 backend.succeed();await page.getByRole('button',{name:'Afsluiten en verwerken',exact:true}).click();await expect(page.getByRole('link',{name:'Open in WhatsApp',exact:true})).toBeVisible();
 expect(backend.calls[0].batchId).toBe(backend.calls[1].batchId);
});
