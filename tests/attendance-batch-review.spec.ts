import {test,expect} from '@playwright/test';
import {createInitialState,demoCatalog,coachReducer,LIVE_MATCH_ID} from '../src/coach-state';
const nav=(page:any,name:string)=>page.getByRole('navigation').getByRole('button',{name,exact:true});
function seed(){const s=createInitialState();s.catalog=demoCatalog();s.catalog.matches=s.catalog.matches.map(m=>m.id===LIVE_MATCH_ID?{...m,date:'2030-10-10'}:m);return s;}
test('dashboard drafts do not change availability until saved, survive reload and can be cancelled',async({page})=>{
 const s=seed();await page.addInitScript(state=>{if(!localStorage.getItem('coachmate:v1'))localStorage.setItem('coachmate:v1',JSON.stringify(state));},s);
 await page.goto('/?device=real');await page.getByText('Aanwezigheid aanpassen',{exact:true}).click();await page.getByLabel('Beschikbaarheid Daan',{exact:true}).selectOption('unavailable');await page.getByLabel('Beschikbaarheid Mats',{exact:true}).selectOption('unavailable');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('coachmate:v1')!).availability['m-021'].p01)).toBe('available');
 await page.getByRole('button',{name:'Sluiten',exact:true}).click();await nav(page,'Beschikbaarheid').click();await page.getByRole('button',{name:'Bekijk reacties SV De Meer',exact:true}).click();await expect(page.getByLabel('Beschikbaarheid Daan',{exact:true})).toHaveValue('unavailable');await page.getByRole('button',{name:'Sluiten',exact:true}).click();
 await page.reload();await nav(page,'Overzicht').click();await page.getByText('Aanwezigheid aanpassen',{exact:true}).click();await expect(page.getByLabel('Beschikbaarheid Daan',{exact:true})).toHaveValue('unavailable');await expect(page.getByText('2 wijzigingen nog niet verwerkt.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Annuleren',exact:true}).click();await expect(page.getByLabel('Beschikbaarheid Daan',{exact:true})).toHaveValue('available');await page.getByLabel('Beschikbaarheid Daan',{exact:true}).selectOption('unavailable');await page.getByRole('button',{name:'Wijzigingen verwerken',exact:true}).click();await expect(page.getByText('Geen wijzigingen om te verwerken.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('coachmate:v1')!).availability['m-021'].p01)).toBe('unavailable');
});
test('Google batches several players in one request, retains draft on failure and retries together',async({page})=>{
 let state=seed();let fail=true;const calls:any[]=[];
 await page.route('http://127.0.0.1:4175/**',async route=>{
 const path=new URL(route.request().url()).pathname;if(path==='/api/action'){const action=route.request().postDataJSON().action;calls.push(action);if(fail)return route.fulfill({status:409,json:{error:'Bron gewijzigd'}});state=coachReducer(state,action);}
 await route.fulfill({json:path==='/api/session'?{configured:true,authenticated:true,email:'batch@test',csrf:'x'}:path==='/api/teams'?{teams:[{teamSeasonId:state.catalog!.teamSeasonId,seasonId:state.catalog!.seasonId,teamName:'Team'}],seasons:[{seasonId:state.catalog!.seasonId,name:'Seizoen',archived:false}]}:['/api/state','/api/action'].includes(path)?{state,revision:1,sourceToken:'x'}:{forms:[],invites:[]}});
 });
 await page.goto('/?device=real');await expect(page.locator('.coach-app')).toHaveAttribute('data-source','google');await page.getByText('Aanwezigheid aanpassen',{exact:true}).click();for(const name of ['Daan','Mats'])await page.getByLabel(`Beschikbaarheid ${name}`,{exact:true}).selectOption('unavailable');expect(calls).toHaveLength(0);
 await page.getByRole('button',{name:'Wijzigingen verwerken',exact:true}).click();await expect(page.getByText(/Opslaan niet bevestigd. Je wijzigingen blijven klaarstaan/)).toBeVisible();expect(calls).toHaveLength(1);expect(calls[0].type).toBe('availability-batch');expect(calls[0].changes).toEqual({p01:'unavailable',p02:'unavailable'});
 fail=false;await page.getByRole('button',{name:'Wijzigingen verwerken',exact:true}).click();await expect(page.getByText('Geen wijzigingen om te verwerken.',{exact:true})).toBeVisible();expect(calls).toHaveLength(2);expect(state.live.field).not.toContain('p01');expect(state.live.field).not.toContain('p02');
});
