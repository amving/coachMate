import {test,expect,type Page} from '@playwright/test';
import {createTeamState,demoCatalog,coachReducer} from '../src/coach-state';
import {applyActionBatch} from '../src/action-batch';
import {journalKey} from '../src/local-cache';
import {personalFormUrl} from '../src/form-links';
test.use({viewport:{width:390,height:844}});
const nav=(p:Page,name:string)=>p.getByRole('navigation').getByRole('button',{name,exact:true});
async function backend(page:Page,{combined=true,conflict=false,finishFail=false,submitted=false,slow=false}={}){
 let state=createTeamState(demoCatalog(),4,6);state.catalog!.players=state.catalog!.players.map((p,i)=>({...p,parentName:'Ouder'+i+' Achternaam',parentPhone:'+31612345678',parentEmail:'parent'+i+'@example.test'}));
 const form={formId:'form',round:1,matchId:'',url:'https://docs.google.com/forms/d/e/test/viewform',codeEntryId:'123',prefillDefaults:'{"entry.456":"Aanwezig"}',statusQuestion:'{"m-021":"question"}'};
 const invites=state.catalog!.players.map((p,i)=>{const start=personalFormUrl(form.url,'123','code'+i,form.prefillDefaults),edit=form.url+'?edit2=edit'+i;return {formId:'form',playerId:p.id,code:'code'+i,personalUrl:start,shortUrl:'https://forms.gle/start'+i,shortUrlSource:start,...(submitted&&i===0?{submittedAt:'2026-10-23T10:00:00Z',responseId:'response',editUrl:edit,shortEditUrl:'https://forms.gle/edit'+i,shortEditUrlSource:edit}:{})};});
 let deliveries:any[]=[],revision=1,first=true,gate:(()=>void)|null=null;
 const calls:any[]=[],gets:string[]=[],distribution=()=>({forms:[form],invites,jobs:[],deliveries,mailReady:true});
 const result=()=>({state,revision,sourceToken:'team-'+revision,distribution:distribution()});
 await page.route('http://127.0.0.1:4175/**',async route=>{
  const path=new URL(route.request().url()).pathname,post=route.request().method()==='POST';if(!post)gets.push(path);
  if(path==='/api/session')return route.fulfill({json:{configured:true,authenticated:true,email:'reliability@test',csrf:'test'}});
  if(path==='/api/teams'){
   if(slow)await new Promise<void>(resolve=>{gate=resolve;});
   return route.fulfill({json:{teams:[{teamSeasonId:state.catalog!.teamSeasonId,seasonId:state.catalog!.seasonId,teamName:'Team'}],seasons:[{seasonId:state.catalog!.seasonId,name:'2026/2027',archived:false}],...(combined?result():{})}});
  }
  if(path==='/api/state')return route.fulfill({json:result()});
  if(path==='/api/forms')return route.fulfill({json:distribution()});
  if(path==='/api/forms/status')return route.fulfill({json:{published:true,accepting:true,issues:[],...form}});
  if(post){const input=route.request().postDataJSON();calls.push({path,...input});
   if(path==='/api/action-batch'){
    if(conflict&&first){first=false;revision++;return route.fulfill({status:409,json:{error:'De bron is gewijzigd.'}});}
    if(finishFail&&first){first=false;return route.fulfill({status:502,json:{error:'Opslag onderbroken.'}});}
    if(!state.committedBatches?.includes(input.batchId)){state=applyActionBatch(state,input.actions);state.committedBatches=[...(state.committedBatches??[]),input.batchId];revision++;}
   }
   if(path==='/api/forms/invite')deliveries.push(...input.playerIds.map((id:string)=>({deliveryId:input.batchId+id,batchId:input.batchId,formId:'form',playerId:id,channel:input.channel??'email',status:input.channel==='whatsapp'?'sent':'queued'})));
   if(path==='/api/forms/import')await new Promise<void>(resolve=>{gate=resolve;});
   return route.fulfill({json:{...result(),imported:0}});
  }
  return route.fulfill({json:{}});
 });
 return {calls,gets,release:()=>gate?.(),getState:()=>state};
}
async function open(page:Page){await page.goto('/?device=real');await expect(page.locator('.coach-app')).toHaveAttribute('data-source','google');await expect(page.locator('.launch-screen')).toHaveCount(0);}
async function invite(page:Page){await nav(page,'Beschikbaarheid').click();await page.getByRole('button',{name:'Uitnodigingen beheren',exact:true}).click();await expect(page.getByRole('heading',{name:'Uitnodigingen',exact:true})).toBeVisible();}
test('one loading surface covers automatic team selection and bootstrap needs only two requests',async({page})=>{
 const f=await backend(page,{slow:true});await page.goto('/?device=real&google=connected');await expect(page.locator('.launch-screen')).toBeVisible();await expect(page.getByText('Kies je team',{exact:true})).toHaveCount(0);await expect(page.getByText('SV De Meer',{exact:true})).toHaveCount(0);
 f.release();await expect(page.locator('.launch-screen')).toHaveCount(0);await expect(nav(page,'Overzicht')).toBeVisible();expect(f.gets).toEqual(['/api/session','/api/teams']);
});
test('sync overlay leaves the match list and navigation in place and preserves one bottom boundary',async({page})=>{
 const f=await backend(page);await open(page);await nav(page,'Beschikbaarheid').click();const before=await page.getByRole('region',{name:'Reacties speelronde'}).boundingBox();
 await page.getByRole('button',{name:'Reacties bijwerken',exact:true}).click();await expect(page.locator('.sync-status')).toBeVisible();const during=await page.getByRole('region',{name:'Reacties speelronde'}).boundingBox();expect(during!.y).toBe(before!.y);
 const box=await page.locator('.app-screen>.mobile-scroll').boundingBox(),bar=await page.getByRole('navigation',{name:'Hoofdnavigatie'}).boundingBox();expect(Math.abs(box!.y+box!.height-bar!.y)).toBeLessThan(1);expect(844-(bar!.y+bar!.height)).toBeLessThan(1);expect(bar!.height).toBe(62);
 await page.screenshot({path:'outputs/reliability-ios-status.png'});f.release();await expect(page.locator('.sync-status')).toHaveCount(0);
});
test('failed finish reports inside the sheet and retry commits the same batch exactly once',async({page})=>{
 const f=await backend(page,{finishFail:true});await open(page);await nav(page,'Live').click();await page.getByRole('button',{name:'Wedstrijddata verwerken',exact:true}).click();await page.getByRole('button',{name:'Afsluiten en verwerken',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Verwerken is niet bevestigd');expect(f.calls).toHaveLength(1);await page.getByRole('button',{name:'Afsluiten en verwerken',exact:true}).click();await expect(page.getByRole('link',{name:'Open in WhatsApp',exact:true})).toBeVisible();expect(f.calls[0].batchId).toBe(f.calls[1].batchId);
});
test('conflict Retry and More open usable recovery sheets and preserve an original backup',async({page})=>{
 const f=await backend(page,{conflict:true});await open(page);await nav(page,'Live').click();await page.getByRole('button',{name:'Goal voor Speler of eigen doelpunt',exact:true}).click();await page.getByRole('button',{name:'Kies Daan',exact:true}).click();await page.getByRole('button',{name:'Goal registreren',exact:true}).click();await page.getByRole('button',{name:'Tussentijds opslaan',exact:true}).click();
 await expect(page.locator('.storage-warning')).toContainText('bron is gewijzigd');await page.getByRole('button',{name:'Conceptopties',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Vergelijken met Google');await page.getByRole('button',{name:'Sluiten',exact:true}).click();await page.getByRole('button',{name:'Opnieuw opslaan',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Na toepassen concept');await expect(page.getByRole('dialog')).toContainText('1 – 0');await page.screenshot({path:'outputs/reliability-recovery.png'});await page.getByRole('button',{name:'Concept toepassen en opslaan',exact:true}).click();await expect(page.getByRole('region',{name:'Lokaal wedstrijdconcept'})).toHaveCount(0);expect(f.getState().live.goals).toHaveLength(1);expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.includes(':backup:')))).toBe(true);
});
test('WhatsApp prepares all unsent recipients, persists exact drafts, and opening never marks them sent',async({page,context})=>{
 const f=await backend(page,{submitted:true});await context.route('https://wa.me/**',route=>route.fulfill({body:'Test WhatsApp'}));await context.route('https://web.whatsapp.com/**',route=>route.fulfill({body:'Test WhatsApp Web'}));await open(page);await invite(page);await page.getByRole('tab',{name:'WhatsApp',exact:true}).click();await page.getByRole('button',{name:'Zet 9 WhatsApp-berichten klaar',exact:true}).click();await expect(page.locator('.whatsapp-draft')).toHaveCount(9);const first=page.locator('.whatsapp-draft').first();await expect(first).toContainText('Hi Ouder1,');await expect(first).toContainText('beschikbaarheid van Mats voor speelronde 1');const text=new URL((await first.getByRole('link',{name:'Open persoonlijk bericht in WhatsApp',exact:true}).getAttribute('href'))!).searchParams.get('text');expect(text).toContain('https://forms.gle/start1');expect(text).not.toContain('edit');
 await page.reload();await invite(page);await page.getByRole('tab',{name:'WhatsApp',exact:true}).click();await expect(page.locator('.whatsapp-draft')).toHaveCount(9);
 const d=page.locator('.whatsapp-draft').first();const popupPromise=page.waitForEvent('popup');await d.getByRole('link',{name:'Open persoonlijk bericht in WhatsApp',exact:true}).click();const popup=await popupPromise;await popup.close();await expect(d).toContainText('Geopend · verzending nog bevestigen');expect(f.calls).toHaveLength(0);await d.getByRole('button',{name:'Ik heb dit bericht verstuurd',exact:true}).click();await expect(d).toContainText('Deze speler is uitgenodigd');expect(f.calls[0].channel).toBe('whatsapp');await page.screenshot({path:'outputs/reliability-whatsapp-drafts.png'});
});
test('invited players expose only a separate edit-link message and no new start link',async({page})=>{
 await backend(page,{submitted:true});await open(page);await invite(page);await expect(page.getByLabel('Uitnodiging voor Daan de Vries',{exact:true})).toHaveCount(0);await page.getByRole('tab',{name:'Uitgenodigd 1',exact:true}).click();await page.getByRole('button',{name:'Wijzigingslink nasturen',exact:true}).click();const link=page.getByRole('link',{name:'Wijzigingslink via WhatsApp nasturen',exact:true}),text=new URL((await link.getAttribute('href'))!).searchParams.get('text')!;expect(text).toContain('https://forms.gle/edit0');expect(text).not.toContain('start0');await page.screenshot({path:'outputs/reliability-edit-link.png'});
});
