import {test,expect,type Page} from '@playwright/test';
import {createTeamState,demoCatalog} from '../src/coach-state';
import {personalFormUrl} from '../src/form-links';
import {defaultInvitationMessage} from '../src/invitations';
test.setTimeout(45000);
async function mockGoogle(page:Page,{lost=false,stale=false}={}){
 const catalog=demoCatalog();catalog.players=catalog.players.map(p=>({...p,parentEmail:'parent@example.test',parentPhone:'+31612345678'}));
 const state=createTeamState(catalog,4,6),posts:any[]=[];let account='coach@example.test';
 const form={formId:'fixture',round:1,matchId:'',url:'https://docs.google.com/forms/d/e/test/viewform',codeEntryId:'123',prefillDefaults:'{"entry.456":"Aanwezig"}',statusQuestion:'{"m":"q"}'};
 const invites=catalog.players.map((p,i)=>{const start=personalFormUrl(form.url,'123','code-'+p.id,form.prefillDefaults),edit=form.url+'?edit2=opaque';return {formId:form.formId,playerId:p.id,code:'code-'+p.id,personalUrl:start,shortUrl:'https://forms.gle/start'+i,shortUrlSource:stale?'old':start,...(i===0?{submittedAt:'2026-10-17T10:00:00Z',editUrl:edit,shortEditUrl:'https://forms.gle/edit0',shortEditUrlSource:stale?'old':edit}:{})};});
 await page.route('http://127.0.0.1:4175/**',async route=>{
  const path=new URL(route.request().url()).pathname;let data:any={state,revision:1,sourceToken:'fixed'};
  if(path==='/api/session')data={configured:true,authenticated:true,email:account,csrf:'x'};
  if(path==='/api/teams')data={teams:[{teamSeasonId:catalog.teamSeasonId,seasonId:catalog.seasonId,teamName:catalog.teamName}],seasons:[{seasonId:catalog.seasonId,name:catalog.seasonName,archived:false}]};
  if(path==='/api/forms')data={forms:[form],invites,mailReady:true,jobs:[],deliveries:posts.flatMap(p=>p.playerIds.map((id:string)=>({formId:form.formId,playerId:id,batchId:p.batchId,status:'sent'})))};
  if(path==='/api/forms/status')data={published:true,accepting:true,issues:[],url:form.url,codeEntryId:'123',prefillDefaults:form.prefillDefaults};
  if(path==='/api/forms/invite'){
   posts.push(route.request().postDataJSON());if(lost)return route.abort('failed');
   data={...data,deliveries:posts.at(-1).playerIds.map((id:string)=>({formId:form.formId,playerId:id,batchId:posts.at(-1).batchId,status:'sent'}))};
  }
  await route.fulfill({json:data});
 });
 return {posts,setAccount:(value:string)=>{account=value;}};
}
async function availability(page:Page,url='/?device=real'){
 await page.goto(url);await page.getByRole('navigation',{name:'Hoofdnavigatie'}).getByRole('button',{name:'Beschikbaarheid',exact:true}).click();
}
async function invitations(page:Page){await page.getByRole('button',{name:'Uitnodigingen beheren',exact:true}).click();await expect(page.getByRole('heading',{name:'Uitnodigingen',exact:true})).toBeVisible();}

for(const real of [false,true])test(`recipient drag and wheel scroll normally without moving the background or selecting players (real=${real})`,async({page})=>{
 await page.setViewportSize(real?{width:390,height:844}:{width:1100,height:1100});
 await availability(page,'/?design=assistant&case=invitation-scroll-'+real+(real?'&device=real':''));
 const summary=page.getByRole('region',{name:'Reacties speelronde'});await expect(summary.getByRole('heading',{name:'Speelronde 1',exact:true})).toBeVisible();await expect(summary).toContainText('Lopende speelronde');
 await invitations(page);
 const inner=page.locator('.availability-page .preparation-scroll .mobile-scroll'),outer=page.locator('.app-screen > .mobile-scroll');
 const before=await outer.evaluate(el=>el.scrollTop),selected=await page.locator('.invitation-recipient input:checked').count();
 const row=await page.locator('.invitation-recipient').nth(2).boundingBox();expect(row).not.toBeNull();
 await page.mouse.move(row!.x+55,row!.y+30);await page.mouse.down();await page.mouse.move(row!.x+55,row!.y-190,{steps:16});await page.mouse.up();
 await expect.poll(()=>inner.evaluate(el=>el.scrollTop)).toBeGreaterThan(160);
 expect(await outer.evaluate(el=>el.scrollTop)).toBe(before);expect(await page.locator('.invitation-recipient input:checked').count()).toBe(selected);
 await inner.evaluate(el=>{el.scrollTop=0;});
 const bounds=await inner.boundingBox();await page.mouse.move(bounds!.x+bounds!.width/2,bounds!.y+150);await page.mouse.wheel(0,450);
 await expect.poll(()=>inner.evaluate(el=>el.scrollTop)).toBeGreaterThan(300);expect(await outer.evaluate(el=>el.scrollTop)).toBe(before);
 await page.screenshot({path:`outputs/invitation-scroll-${real?'real':'preview'}.png`,fullPage:true});
});

test('coach text survives reload, email preview uses labeled links, and another account has its own draft',async({page})=>{
 await page.setViewportSize({width:390,height:844});const f=await mockGoogle(page);await availability(page);await invitations(page);
 const editor=page.getByLabel('Uitnodigingstekst',{exact:true});
 const text='Lieve ouders van {speler},\nWillen jullie vóór vrijdag reageren? Groet, de coach.';
 await editor.fill(text);await editor.press('Tab');
 const preview=page.locator('.invitation-message-preview');await expect(preview.getByLabel('Uitnodigingstekst',{exact:true})).toHaveValue(text);await expect(preview).not.toContainText('docs.google.com');await expect(preview.getByRole('link')).toHaveCount(1);await expect(preview.getByRole('link').first()).toHaveAttribute('href','https://forms.gle/start1');
 await page.screenshot({path:'outputs/invitation-custom-text.png',fullPage:true});
 await availability(page);await invitations(page);await expect(editor).toHaveValue(text);
 f.setAccount('other@example.test');await availability(page);await invitations(page);await expect(editor).toHaveValue(defaultInvitationMessage);expect(f.posts).toHaveLength(0);
});

test('custom text is queued once and a lost response is reconciled after reload without resending',async({page})=>{
 await page.setViewportSize({width:390,height:844});const f=await mockGoogle(page,{lost:true});await availability(page);await invitations(page);
 const editor=page.getByLabel('Uitnodigingstekst',{exact:true});await editor.fill('Graag vóór vrijdag invullen voor {speler}.');await editor.press('Tab');
 await page.getByRole('button',{name:'Verstuur 9 persoonlijke e-mails',exact:true}).click();await expect.poll(()=>f.posts.length).toBe(1);expect(f.posts[0].message).toBe('Graag vóór vrijdag invullen voor {speler}.');
 await availability(page);await invitations(page);await page.getByRole('tab',{name:/Uitgenodigd/}).click();await expect(page.locator('.delivery-status').last()).toHaveText('Verstuurd');expect(f.posts).toHaveLength(1);
});

test('WhatsApp receives genuine personal short links and a frozen coach message for the whole queue',async({page})=>{
 await page.setViewportSize({width:390,height:844});const f=await mockGoogle(page);await availability(page);await invitations(page);await page.getByRole('tab',{name:'WhatsApp',exact:true}).click();
 const editor=page.getByLabel('Uitnodigingstekst',{exact:true});await editor.fill('Hoi {speler}, even reageren graag.');await editor.press('Tab');
 await page.getByRole('button',{name:'Zet 9 WhatsApp-berichten klaar',exact:true}).click();const link=page.getByRole('link',{name:'Open persoonlijk bericht in WhatsApp',exact:true});
 const text=new URL((await link.getAttribute('href'))!).searchParams.get('text')!;expect(text).toContain('Hoi Mats Bakker');expect(text).not.toContain('https://forms.gle/edit0');expect(text).toContain('https://forms.gle/start1');expect(text).not.toContain('docs.google.com');await expect(editor).toHaveCount(0);
 await page.locator('.whatsapp-draft').nth(1).locator('summary').click();const next=new URL((await page.locator('.whatsapp-draft').nth(1).getByRole('link',{name:'Open persoonlijk bericht in WhatsApp',exact:true}).getAttribute('href'))!).searchParams.get('text')!;expect(next).toContain('Hoi Levi');expect(next).toContain('https://forms.gle/start2');expect(next).not.toContain('edit0');expect(f.posts).toHaveLength(0);
});

test('single inline editor keeps standard content, restores default and has a focus-safe font size',async({page})=>{
 await page.setViewportSize({width:390,height:844});const f=await mockGoogle(page);await availability(page);await invitations(page);
 const editor=page.getByLabel('Uitnodigingstekst',{exact:true});await expect(editor).toHaveCount(1);
 const preview=page.locator('.invitation-message-preview');await expect(preview).toContainText('Hi ');await expect(preview).not.toContainText('bewerklink');
 await editor.scrollIntoViewIfNeeded();await editor.click();expect(await editor.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
 await editor.fill('Graag vandaag reageren.');await editor.press('Tab');await expect(preview.getByRole('link')).toHaveCount(1);
 await page.getByRole('button',{name:'Standaardtekst herstellen',exact:true}).click();await expect(editor).toHaveValue(defaultInvitationMessage);expect(f.posts).toHaveLength(0);
});


test('framed invitation cursor follows hover and list dragging without moving the background',async({page})=>{
 await page.setViewportSize({width:869,height:884});
 await availability(page,'/?design=assistant&case=invitation-cursor');await invitations(page);
 const screen=page.getByTestId('device-screen'),cursor=page.getByTestId('mobile-cursor'),outer=page.locator('.app-screen > .mobile-scroll'),inner=page.locator('.availability-page .preparation-scroll .mobile-scroll');
 const background=await outer.evaluate(el=>el.scrollTop),selected=await page.locator('.invitation-recipient input:checked').count();
 async function pointerAt(x:number,y:number){
  await page.mouse.move(x,y,{steps:6});await expect(cursor).toHaveAttribute('data-visible','true');
  await expect.poll(async()=>{const b=await cursor.boundingBox();return b?Math.abs(b.x+b.width/2-x)+Math.abs(b.y+b.height/2-y):Infinity;}).toBeLessThan(2);
 }
 await page.mouse.move(25,25);await expect(cursor).toHaveAttribute('data-visible','false');
 const row=await page.locator('.invitation-recipient').nth(2).boundingBox();expect(row).not.toBeNull();
 await pointerAt(row!.x+55,row!.y+20);const first=await cursor.getAttribute('style');
 await pointerAt(row!.x+150,row!.y+45);expect(await cursor.getAttribute('style')).not.toBe(first);
 await page.mouse.down();await pointerAt(row!.x+150,row!.y-160);await page.mouse.up();
 await expect.poll(()=>inner.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);expect(await outer.evaluate(el=>el.scrollTop)).toBe(background);expect(await page.locator('.invitation-recipient input:checked').count()).toBe(selected);
 await page.getByLabel('Uitnodigingstekst',{exact:true}).scrollIntoViewIfNeeded();
 const preview=await page.locator('.invitation-message-preview > p').first().boundingBox();expect(preview).not.toBeNull();await pointerAt(preview!.x+80,preview!.y+10);
 await page.screenshot({path:'outputs/invitation-cursor-parent-preview.png'});
 await page.mouse.move(25,25);await expect(cursor).toHaveAttribute('data-visible','false');await expect(screen).toBeVisible();
});

test('demo invitation greeting follows the selected recipient instead of a generic parent heading',async({page})=>{
 await availability(page,'/?design=assistant&case=invitation-parent-heading&device=real');await invitations(page);
 const greeting=page.locator('.invitation-message-preview > p').first();await expect(greeting).toHaveText('Hi Sanne,');
 await page.getByLabel('Uitnodiging voor Daan de Vries',{exact:true}).uncheck();await expect(greeting).toHaveText('Hi Mark,');
 await page.getByRole('tab',{name:'WhatsApp',exact:true}).click();await expect(greeting).toHaveText('Hi Mark,');
});

test('Google invitation greeting prefers parentName to the legacy parent value',async({page})=>{
 const state=createTeamState(demoCatalog(),4,6);state.catalog!.players[0]={...state.catalog!.players[0],parentName:'Anne Voorbeeld',parent:'Andere naam'};
 const form={formId:'parent-heading',round:1,matchId:'',url:'https://docs.google.com/forms/d/e/test/viewform',codeEntryId:'123',prefillDefaults:'{"entry.456":"Aanwezig"}'};
 await page.route('http://127.0.0.1:4175/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const data=path==='/api/session'?{configured:true,authenticated:true,email:'heading@example.test',csrf:'x'}:path==='/api/teams'?{teams:[{teamSeasonId:state.catalog!.teamSeasonId,seasonId:state.catalog!.seasonId,teamName:'Team'}],seasons:[],state,revision:1,sourceToken:'fixed',distribution:{forms:[form],invites:state.catalog!.players.map(p=>({formId:form.formId,playerId:p.id,code:'code-'+p.id})),jobs:[],deliveries:[],mailReady:true}}:path==='/api/forms/status'?{...form,published:true,accepting:true,issues:[]}:{forms:[form],invites:state.catalog!.players.map(p=>({formId:form.formId,playerId:p.id,code:'code-'+p.id})),jobs:[],deliveries:[],mailReady:true};
  await route.fulfill({json:data});
 });
 await availability(page);await invitations(page);await page.getByRole('tab',{name:'WhatsApp',exact:true}).click();await expect(page.locator('.invitation-message-preview > p').first()).toHaveText('Hi Anne,');
});
