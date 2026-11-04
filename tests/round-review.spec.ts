import {test,expect} from '@playwright/test';
import {createInitialState,demoCatalog,coachReducer} from '../src/coach-state';
const nav=(page:any,name:string)=>page.getByRole('navigation').getByRole('button',{name,exact:true});
test('new round adds several matches, keeps prior answers and requests one round Form',async({page})=>{
 let state={...createInitialState(),catalog:structuredClone(demoCatalog())};const before=structuredClone(state.availability);const calls:any[]=[];let forms:any[]=[{formId:"old",codeEntryId:"123",matchId:"",round:1,url:"https://docs.google.com/forms/d/e/test/viewform",prefillDefaults:'{"entry.1":"Aanwezig"}'}];let fail=true;
 await page.route('http://127.0.0.1:4175/**',async route=>{
 const path=new URL(route.request().url()).pathname;
 if(path==='/api/action'){calls.push(route.request().postDataJSON().action);if(fail)return route.fulfill({status:409,json:{error:'Probeer opnieuw'}});state=coachReducer(state,calls.at(-1)) as typeof state;}
 if(path==='/api/forms/prepare'){calls.push(route.request().postDataJSON());forms=[...forms,{formId:'round-form',codeEntryId:'123',matchId:'',round:2,url:'https://docs.google.com/forms/d/e/test/viewform',prefillDefaults:'{"entry.1":"Aanwezig"}'}];}
 if(path==='/api/forms/status')return route.fulfill({json:{published:true,accepting:true,issues:[],url:forms[0].url,prefillDefaults:forms[0].prefillDefaults}});
 await route.fulfill({json:path==='/api/session'?{configured:true,authenticated:true,email:'round@test',csrf:'x'}:path==='/api/teams'?{teams:[{teamSeasonId:state.catalog.teamSeasonId,seasonId:state.catalog.seasonId,teamName:'Team'}],seasons:[{seasonId:state.catalog.seasonId,name:'Seizoen',archived:false}]}:['/api/state','/api/action','/api/forms/prepare'].includes(path)?{state,revision:1,sourceToken:'x',...(path==='/api/forms/prepare'?{form:forms[0]}:{})}:{forms,invites:forms.flatMap(f=>state.catalog.players.map(p=>({formId:f.formId,playerId:p.id,code:'code-'+p.id}))),mailReady:true}});
 });
 await page.goto('/?device=real');await expect(page.locator('.coach-app')).toHaveAttribute('data-source','google');await nav(page,'Beschikbaarheid').click();await page.getByRole('button',{name:/Nieuwe ronde voorbereiden/}).click();
 await page.getByLabel('Tegenstander 1',{exact:true}).fill('Nieuwe club');await page.getByLabel('Datum 1',{exact:true}).fill('2030-10-10');await page.getByRole('button',{name:'Nog een wedstrijd',exact:true}).click();await page.getByLabel('Tegenstander 2',{exact:true}).fill('Tweede club');await page.getByLabel('Datum 2',{exact:true}).fill('2030-10-17');
 await page.getByRole('button',{name:'Opslaan en formulier voorbereiden',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Opslaan niet bevestigd');await expect(page.getByRole('dialog')).toContainText('Tweede club');fail=false;
 await page.getByRole('button',{name:'Opslaan en formulier voorbereiden',exact:true}).click();await expect(page.getByRole('button',{name:'Voorbereiding sluiten',exact:true})).toBeVisible();await page.getByRole('tab',{name:'WhatsApp',exact:true}).click();await page.getByRole('button',{name:'Zet 10 WhatsApp-berichten klaar',exact:true}).click();await page.getByRole('button',{name:'Naar actieve ronde',exact:true}).click();await expect(page.locator('.active-round-context')).toContainText('Speelronde 2');await expect(page.locator('.availability-match')).toHaveCount(2);expect(state.availability['m-021']).toEqual(before['m-021']);expect(calls.at(-1).round).toBe(2);expect(calls.at(-1).matchId).toBeUndefined();
 await page.getByRole('button',{name:'Eerdere speelrondes',exact:true}).click();await page.getByRole('button',{name:/Speelronde 1/}).click();await page.getByRole('button',{name:'Bekijk reacties SV De Meer',exact:true}).click();await expect(page.getByRole('dialog').locator('.read-status').first()).toHaveText(before['m-021'].p01==='available'?'Beschikbaar':'Afwezig');await expect(page.getByRole('button',{name:'Aanpassen',exact:true})).toHaveCount(0);
});


test('numeric source dates are readable without blue framing on dashboard and availability',async({page})=>{
 const state={...createInitialState(),catalog:structuredClone(demoCatalog())};state.catalog.matches=state.catalog.matches.map(m=>m.id==='m-021'?{...m,date:'03-10-2030',shortDate:'03-10-2030'}:m);
 await page.addInitScript(state=>localStorage.setItem('coachmate:v1',JSON.stringify(state)),state);await page.setViewportSize({width:375,height:812});await page.goto('/?device=real');
 const dashboard=page.locator('.next-game-overview .date-tile');await expect(dashboard).toHaveText('3okt 2030');await expect(dashboard).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await nav(page,'Beschikbaarheid').click();const date=page.locator('.availability-match').filter({hasText:'SV De Meer'}).locator('.date-tile');await expect(date).toHaveText('3okt 2030');await expect(date).toHaveCSS('border-top-width','0px');
 expect(await date.evaluate(el=>Array.from(el.children).every(child=>child.scrollWidth<=child.clientWidth))).toBe(true);
});
