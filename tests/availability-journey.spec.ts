import {test,expect,type Page} from '@playwright/test';
import {journalKey} from '../src/local-cache';
import {createTeamState,demoCatalog,coachReducer} from '../src/coach-state';
test.use({viewport:{width:390,height:844}});
test.setTimeout(60000);
const nav=(page:Page)=>page.getByRole('navigation').getByRole('button',{name:'Beschikbaarheid',exact:true});
async function setup(page:Page,{remote=true,archived=false,failSave=false,failImport=false,failPrepareOnce=false,otherTeam=false,lostInvitationResponse=false,sheetRound=false,delayForm=false,invalidForm=false,failRefresh=false}={}){
 const catalog=demoCatalog();if(otherTeam)catalog.teamSeasonId='other-team-2030';catalog.archived=archived;catalog.players[0].parentEmail='parent@example.test';catalog.players[0].parentPhone='+31612345678';catalog.matches=catalog.matches.map(m=>({...m,date:'2030-10-20'}));
 let state=createTeamState(catalog,4,8);state.availability[catalog.matches[0].id][catalog.players[0].id]='available';state.formUpdates={[`${catalog.matches[0].id}/${catalog.players[0].id}`]:{manual:true,time:new Date().toISOString()}};
 if(sheetRound)state=coachReducer(state,{type:'save-round-matches',round:2,matches:[{id:'sheet-match',pool:'',date:'2030-11-01',shortDate:'1 nov',time:'09:00',venue:'Uit',opponent:'Imported club',availabilityRound:2}]});
 let pendingForm:any=null,formPolls=0,stateReads=0,formReadyAt=0;let jobs:any[]=[];
 let forms:any[]=[{formId:'old',round:1,matchId:'',url:'https://docs.google.com/forms/d/e/fixture/viewform',codeEntryId:'123',prefillDefaults:'{"entry.456":"Aanwezig"}'}];
 let invites:any[]=[{formId:'old',playerId:catalog.players[1].id,code:'test',submittedAt:'2030-10-01T10:00:00Z'}];
 let deliveries:any[]=[{formId:'old',playerId:catalog.players[0].id,status:'sent'},{formId:'old',playerId:catalog.players[2].id,status:'failed'},{formId:'old',playerId:catalog.players[3].id,status:'uncertain'}];
 const posts:{path:string;data:any}[]=[];
 await page.route('http://127.0.0.1:4175/**',async route=>{
  const path=new URL(route.request().url()).pathname,body=route.request().method()==='POST'?route.request().postDataJSON():null;
  if(body)posts.push({path,data:body});
  if(path==='/api/state'&&++stateReads>1&&failRefresh)return route.fulfill({status:503,json:{error:'Source offline'}});
  if(path==='/api/forms'&&pendingForm&&++formPolls>=3&&Date.now()>=formReadyAt){forms.push(pendingForm);invites.push(...catalog.players.map(p=>({formId:'new',playerId:p.id,code:'code-'+p.id})));pendingForm=null;jobs=[{jobId:'job',round:2,status:'ready'}];}
  let data:any={state,revision:1,sourceToken:'fixed'};
  if(path==='/api/session')data={configured:remote,authenticated:remote,email:'availability@test',csrf:'x'};
  if(path==='/api/teams')data={teams:[{teamSeasonId:catalog.teamSeasonId,seasonId:catalog.seasonId,teamName:'Team'}],seasons:[{seasonId:catalog.seasonId,name:'Seizoen',archived}]};
  if(path==='/api/action'){
   if(failSave)return route.fulfill({status:500,json:{error:'Test: opslaan niet mogelijk'}});
   state=coachReducer(state,body.action);data={...data,state};
  }
  if(path==='/api/forms/prepare'){
   if(failPrepareOnce){failPrepareOnce=false;return route.fulfill({status:502,json:{error:'Test: voorbereiden mislukt'}});}
   const form={...forms[0],formId:'new',round:body.round};if(delayForm){formReadyAt=Date.now()+600;pendingForm=form;jobs=[{jobId:'job',round:body.round,status:'queued'}];}else{forms=[...forms.filter(f=>f.formId!=='new'),form];invites=[...invites,...catalog.players.map(p=>({formId:'new',playerId:p.id,code:'code-'+p.id}))];}
  }
  if(path==='/api/forms/invite'){deliveries=[...deliveries,...body.playerIds.map((id:string)=>({formId:body.formId,playerId:id,status:'sent',batchId:body.batchId}))];if(lostInvitationResponse){lostInvitationResponse=false;return route.abort('failed');}}
  if(path==='/api/forms/import'&&failImport)return route.fulfill({status:500,json:{error:'Test: import mislukt'}});
  if(path==='/api/forms'||path.startsWith('/api/forms/'))data={...data,forms,invites,deliveries,jobs,mailReady:true};
  if(path==='/api/forms/status')data={published:true,accepting:true,issues:invalidForm&&new URL(route.request().url()).searchParams.get('form')==='new'?['De wedstrijdvragen komen niet overeen.']:[],url:forms[0].url,prefillDefaults:forms[0].prefillDefaults};
  await route.fulfill({json:data});
 });
 if(!remote)await page.addInitScript(s=>{if(!localStorage.getItem('coachmate:v1'))localStorage.setItem('coachmate:v1',JSON.stringify(s));},state);
 await page.goto('/?device=real',{waitUntil:'domcontentloaded'});await nav(page).click();await expect(page.getByRole('region',{name:'Reacties speelronde'})).toBeVisible();
 return {posts,getState:()=>state,setSource:(update:(s:typeof state)=>typeof state)=>{state=update(state);},catalog};
}
async function start(page:Page){await page.getByRole('button',{name:/Nieuwe ronde voorbereiden/}).click();await page.getByLabel('Tegenstander 1',{exact:true}).fill('Nieuwe tegenstander');await page.getByLabel('Datum 1',{exact:true}).fill('2030-11-02');await page.getByLabel('Tijd 1',{exact:true}).fill('10:00');}
async function prepare(page:Page){await page.getByRole('button',{name:'Opslaan en formulier voorbereiden',exact:true}).click();await expect(page.getByRole('dialog').getByRole('heading',{name:'Uitnodigen',exact:true})).toBeVisible();}
const active=(page:Page)=>page.locator('.active-round-context');

test('active screen is compact, has no round picker and separates invitation details from reactions',async({page})=>{
 const {posts}=await setup(page,{failImport:true});const summary=page.getByRole('region',{name:'Reacties speelronde'});await expect(page.getByLabel('Wedstrijdronde',{exact:true})).toHaveCount(0);await expect(summary.getByText('1 van 10',{exact:true})).toBeVisible();await expect(summary).not.toContainText('in behandeling');await expect(summary).toContainText('2 uitnodigingen controleren');
 await page.getByRole('button',{name:'Reacties bijwerken',exact:true}).click();await expect(summary).toContainText('Bijwerken niet gelukt');await expect(page.getByText(/^Bijgewerkt:/)).toHaveCount(0);expect(posts.filter(p=>p.path==='/api/forms/invite')).toHaveLength(0);
 await page.getByRole('button',{name:'Uitnodigingen beheren',exact:true}).click();await page.getByText('Verzendstatus',{exact:true}).click();await expect(page.getByRole('dialog')).toContainText('1 verstuurd · 0 in behandeling');await expect(page.getByRole('dialog')).toContainText('1 mislukt · 1 onzeker');
});

test('two-step preparation preserves both match and invitation drafts across reload and back navigation',async({page})=>{
 const {posts}=await setup(page);await start(page);expect(posts).toHaveLength(0);await page.getByRole('button',{name:'Sluiten',exact:true}).click();await expect(active(page)).toContainText('Speelronde 1');await expect(page.getByRole('button',{name:/Voorbereiding hervatten/})).toContainText('stap 1 van 2');
 await page.reload({waitUntil:'domcontentloaded'});await nav(page).click();await page.getByRole('button',{name:/Voorbereiding hervatten/}).click();await expect(page.getByLabel('Tegenstander 1',{exact:true})).toHaveValue('Nieuwe tegenstander');await prepare(page);await page.getByRole('tab',{name:'WhatsApp',exact:true}).click();await page.getByRole('checkbox',{name:'Uitnodiging voor Daan de Vries',exact:true}).uncheck();await page.getByRole('button',{name:'Sluiten',exact:true}).click();await expect(active(page)).toContainText('Speelronde 1');
 await page.reload({waitUntil:'domcontentloaded'});await nav(page).click();await page.getByRole('button',{name:/Voorbereiding hervatten/}).click();await expect(page.getByRole('checkbox',{name:'Uitnodiging voor Daan de Vries',exact:true})).not.toBeChecked();await expect(page.getByRole('tab',{name:'WhatsApp',exact:true})).toHaveAttribute('aria-selected','true');await page.getByRole('button',{name:'Terug',exact:true}).click();await expect(page.getByLabel('Tegenstander 1',{exact:true})).toHaveValue('Nieuwe tegenstander');expect(posts.filter(p=>p.path==='/api/forms/invite')).toHaveLength(0);expect(posts.filter(p=>p.path==='/api/action')).toHaveLength(1);
});

test('preparation saves once and explicit send alone activates the new round',async({page})=>{
 const {posts}=await setup(page);await start(page);await prepare(page);await expect(page.getByRole('button',{name:'Verstuur 1 persoonlijke e-mail',exact:true})).toBeEnabled();expect(posts.filter(p=>p.path==='/api/forms/invite')).toHaveLength(0);await page.getByRole('button',{name:'Voorbereiding sluiten',exact:true}).click();await expect(active(page)).toContainText('Speelronde 1');
 await page.getByRole('button',{name:/Voorbereiding hervatten/}).click();await page.getByRole('button',{name:'Verstuur 1 persoonlijke e-mail',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('1 van 1 verstuurd');expect(posts.filter(p=>p.path==='/api/forms/invite')[0].data.playerIds).toEqual(['p01']);expect(posts.filter(p=>p.path==='/api/action')).toHaveLength(1);
 await page.getByRole('button',{name:'Naar actieve ronde',exact:true}).click();await expect(active(page)).toContainText('Speelronde 2');await expect(page.getByRole('button',{name:/Voorbereiding hervatten/})).toHaveCount(0);await page.getByRole('button',{name:'Eerdere speelrondes',exact:true}).click();await page.getByRole('button',{name:/Speelronde 1/}).click();await expect(page.getByRole('dialog')).toContainText('alleen lezen');await page.getByRole('button',{name:'Sluiten',exact:true}).click();await expect(active(page)).toContainText('Speelronde 2');
});

test('save errors retain the match draft and never request a form or send invitations',async({page})=>{
 const {posts}=await setup(page,{failSave:true});await start(page);await page.getByRole('button',{name:'Opslaan en formulier voorbereiden',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Opslaan niet bevestigd');expect(posts.filter(p=>p.path.startsWith('/api/forms/'))).toHaveLength(0);await page.getByRole('button',{name:'Sluiten',exact:true}).click();await page.reload({waitUntil:'domcontentloaded'});await nav(page).click();await page.getByRole('button',{name:/Voorbereiding hervatten/}).click();await expect(page.getByLabel('Tegenstander 1',{exact:true})).toHaveValue('Nieuwe tegenstander');
});

test('WhatsApp queue preserves progress without claiming delivery or sending email',async({page})=>{
 const {posts}=await setup(page);await start(page);await prepare(page);await page.getByRole('tab',{name:'WhatsApp',exact:true}).click();await page.getByRole('button',{name:'Zet 10 WhatsApp-berichten klaar',exact:true}).click();await expect(page.getByRole('link',{name:'Open persoonlijk bericht in WhatsApp',exact:true})).toHaveAttribute('href',/^https:\/\/wa.me\/31612345678/);await page.getByRole('button',{name:'Deze speler overslaan',exact:true}).click();await expect(page.getByRole('link',{name:'Open persoonlijk bericht in WhatsApp',exact:true})).toHaveAttribute('href',/^https:\/\/wa.me\/\?text=/);expect(posts.filter(p=>p.path==='/api/forms/invite')).toHaveLength(0);await expect(page.getByRole('dialog')).toContainText('Een geopend bericht is nog niet verstuurd');await page.reload({waitUntil:'domcontentloaded'});await nav(page).click();await page.getByRole('button',{name:/Voorbereiding hervatten/}).click();await expect(page.getByRole('dialog')).toContainText('Bericht 2 van 10');
});

test('archived team stays read-only',async({page})=>{await setup(page,{archived:true});await expect(page.getByRole('button',{name:/Nieuwe ronde voorbereiden/})).toBeDisabled();await expect(page.getByRole('button',{name:'Reacties bijwerken',exact:true})).toBeDisabled();});

test('local demo previews step two without external writes or activating the new round',async({page})=>{
 const {posts}=await setup(page,{remote:false});await start(page);await prepare(page);await expect(page.getByRole('dialog')).toContainText('Lokale demo');await expect(page.getByRole('button',{name:'Uitnodigingen versturen',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Voorbereiding sluiten',exact:true}).click();await expect(active(page)).toContainText('Speelronde 1');expect(posts).toHaveLength(0);
});

test('form failure retries from saved matches without duplicating the round',async({page})=>{
 const {posts}=await setup(page,{failPrepareOnce:true});await start(page);await page.getByRole('button',{name:'Opslaan en formulier voorbereiden',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Formulier voorbereiden niet bevestigd');await prepare(page);expect(posts.filter(p=>p.path==='/api/action')).toHaveLength(1);expect(posts.filter(p=>p.path==='/api/forms/prepare')).toHaveLength(2);expect(posts.filter(p=>p.path==='/api/forms/invite')).toHaveLength(0);
});

test('preparation is isolated between team seasons',async({page})=>{
 await setup(page);await start(page);await page.getByRole('button',{name:'Sluiten',exact:true}).click();const draft=await page.evaluate(()=>Object.entries(localStorage).find(([key])=>key.startsWith('coachmate:round-preparation:')));await setup(page,{otherTeam:true});await expect(page.getByRole('button',{name:/Nieuwe ronde voorbereiden/})).toBeVisible();await expect(page.getByRole('button',{name:/Voorbereiding hervatten/})).toHaveCount(0);expect(await page.evaluate(key=>localStorage.getItem(key),draft![0])).toBe(draft![1]);
});

test('discarding an unsaved preparation preserves active round and attendance',async({page})=>{
 const {posts,getState}=await setup(page);const before=structuredClone(getState());await start(page);await page.getByRole('button',{name:'Concept verwijderen',exact:true}).click();await page.getByRole('button',{name:'Concept behouden',exact:true}).click();await page.getByRole('button',{name:'Concept verwijderen',exact:true}).click();await page.getByRole('button',{name:'Concept definitief verwijderen',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(active(page)).toContainText('Speelronde 1');expect(getState()).toEqual(before);expect(posts).toHaveLength(0);
});

test('lost invitation response reconciles the delivery without duplicate send',async({page})=>{
 const {posts}=await setup(page,{lostInvitationResponse:true});await start(page);await prepare(page);await page.getByRole('button',{name:'Verstuur 1 persoonlijke e-mail',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('1 van 1 verstuurd',{timeout:15000});await page.getByRole('button',{name:'Naar actieve ronde',exact:true}).click();await expect(active(page)).toContainText('Speelronde 2');expect(posts.filter(p=>p.path==='/api/forms/invite')).toHaveLength(1);
});

test('collapsed match forms retain opponent-date titles and reopen invalid rows',async({page})=>{
 const {posts}=await setup(page);await page.getByRole('button',{name:/Nieuwe ronde voorbereiden/}).click();await page.getByLabel('Tegenstander 1',{exact:true}).fill('SV Testclub');await page.getByLabel('Datum 1',{exact:true}).fill('2030-12-10');await page.getByLabel('Tijd 1',{exact:true}).fill('11:15');await page.getByLabel('Thuis of uit 1',{exact:true}).selectOption('Uit');const toggle=page.getByRole('button',{name:'SV Testclub – 10 dec 2030',exact:true});await page.getByRole('button',{name:'Gereed',exact:true}).click();await expect(toggle).toHaveAttribute('aria-expanded','false');await page.getByRole('button',{name:'Nog een wedstrijd',exact:true}).click();await page.getByRole('button',{name:'Wedstrijd 2',exact:true}).click();await page.getByRole('button',{name:'Opslaan en formulier voorbereiden',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Vul voor iedere wedstrijd');await expect(page.getByLabel('Tegenstander 2',{exact:true})).toBeVisible();await expect(page.getByLabel('Tegenstander 1',{exact:true})).toBeHidden();
 await page.getByRole('button',{name:'Sluiten',exact:true}).click();await page.reload({waitUntil:'domcontentloaded'});await nav(page).click();await page.getByRole('button',{name:/Voorbereiding hervatten/}).click();await page.getByRole('button',{name:'SV Testclub – 10 dec 2030',exact:true}).click();await expect(page.getByLabel('Tegenstander 1',{exact:true})).toHaveValue('SV Testclub');await expect(page.getByLabel('Datum 1',{exact:true})).toHaveValue('2030-12-10');await expect(page.getByLabel('Tijd 1',{exact:true})).toHaveValue('11:15');await expect(page.getByLabel('Thuis of uit 1',{exact:true})).toHaveValue('Uit');expect(posts).toHaveLength(0);
});

test('collapsing a match dismisses the simulated keyboard',async({page})=>{
 await setup(page);await page.setViewportSize({width:1100,height:1100});await page.goto('/',{waitUntil:'domcontentloaded'});await nav(page).click();await page.getByRole('button',{name:/Nieuwe ronde voorbereiden/}).click();await page.getByLabel('Datum 1',{exact:true}).fill('2030-12-10');await page.getByLabel('Tegenstander 1',{exact:true}).fill('Compacte club');await expect(page.getByTestId('keyboard-dock')).toHaveAttribute('data-visible','true');await page.getByRole('button',{name:'Compacte club – 10 dec 2030',exact:true}).click();await expect(page.getByTestId('keyboard-dock')).toHaveAttribute('data-visible','false');await expect(page.getByLabel('Tegenstander 1',{exact:true})).toBeHidden();await page.getByRole('button',{name:'Compacte club – 10 dec 2030',exact:true}).click();await page.getByRole('button',{name:'Nog een wedstrijd',exact:true}).click();await expect(page.getByLabel('Tegenstander 1',{exact:true})).toBeHidden();await expect(page.getByLabel('Tegenstander 2',{exact:true})).toBeVisible();
});


test('existing Sheets round and app addition share one preparation without duplicate matches',async({page})=>{
 const {posts,getState}=await setup(page,{sheetRound:true});const prior=structuredClone(getState().availability);await expect(active(page)).toContainText('Speelronde 1');await page.getByRole('button',{name:/Nieuwe ronde voorbereiden/}).click();await expect(page.getByRole('dialog')).toContainText('Speelronde 2');await expect(page.getByRole('button',{name:'Imported club – 1 nov 2030',exact:true})).toBeVisible();await page.getByRole('button',{name:'Nog een wedstrijd',exact:true}).click();await page.getByLabel('Tegenstander 2',{exact:true}).fill('Extra club');await page.getByLabel('Datum 2',{exact:true}).fill('2030-11-08');await prepare(page);const action=posts.find(p=>p.path==='/api/action')!.data.action;expect(action.type).toBe('save-round-matches');expect(action.matches.map((m:any)=>m.id)).toContain('sheet-match');expect(getState().catalog.matches.filter(m=>m.availabilityRound===2)).toHaveLength(2);expect(getState().availability['m-021']).toEqual(prior['m-021']);expect(posts.filter(p=>p.path==='/api/forms/invite')).toHaveLength(0);
});

test('refresh keeps local additions and requires explicit resolution of conflicting Sheet edits',async({page})=>{
 const {setSource,posts}=await setup(page,{sheetRound:true});await page.getByRole('button',{name:/Nieuwe ronde voorbereiden/}).click();await page.getByRole('button',{name:'Imported club – 1 nov 2030',exact:true}).click();await page.getByLabel('Tegenstander 1',{exact:true}).fill('Coach edit');await page.getByRole('button',{name:'Nog een wedstrijd',exact:true}).click();await page.getByLabel('Tegenstander 2',{exact:true}).fill('Local addition');await page.getByLabel('Datum 2',{exact:true}).fill('2030-11-08');setSource(s=>({...s,catalog:{...s.catalog,matches:s.catalog.matches.map(m=>m.id==='sheet-match'?{...m,opponent:'Sheet edit'}:m)}}));await page.getByRole('button',{name:'Wedstrijden vernieuwen',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('ook in Sheets gewijzigd');await expect(page.getByLabel('Tegenstander 1',{exact:true})).toHaveValue('Coach edit');await page.getByRole('button',{name:'Sheetwijzigingen gebruiken',exact:true}).click();await expect(page.getByLabel('Tegenstander 1',{exact:true})).toHaveValue('Sheet edit');await expect(page.getByLabel('Tegenstander 2',{exact:true})).toHaveValue('Local addition');await prepare(page);expect(posts.filter(p=>p.path==='/api/forms/prepare')).toHaveLength(1);
});

test('form job must finish and validate before the invitation page is shown',async({page})=>{
 const {posts}=await setup(page,{delayForm:true});await start(page);await page.getByRole('button',{name:'Opslaan en formulier voorbereiden',exact:true}).click();await expect(page.getByRole('dialog').getByRole('heading',{name:'Wedstrijden',exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toContainText('Formulier en persoonlijke links');await expect(page.getByRole('button',{name:/Verstuur .*persoonlijke/})).toHaveCount(0);await expect(page.getByRole('dialog').getByRole('heading',{name:'Uitnodigen',exact:true})).toBeVisible({timeout:15000});expect(posts.filter(p=>p.path==='/api/forms/invite')).toHaveLength(0);
});

test('invalid generated form stays in preparation and does not enable invitations',async({page})=>{
 const {posts}=await setup(page,{invalidForm:true});await start(page);await page.getByRole('button',{name:'Opslaan en formulier voorbereiden',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('De wedstrijdvragen komen niet overeen');await expect(page.getByRole('dialog').getByRole('heading',{name:'Wedstrijden',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/Verstuur .*persoonlijke/})).toHaveCount(0);expect(posts.filter(p=>p.path==='/api/forms/invite')).toHaveLength(0);
});

test('failed source refresh does not open a blank preparation or change the active round',async({page})=>{
 const {posts}=await setup(page,{failRefresh:true});await page.getByRole('button',{name:/Nieuwe ronde voorbereiden/}).click();await expect(page.getByText('Wedstrijden vernieuwen lukt niet.',{exact:false})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(active(page)).toContainText('Speelronde 1');expect(posts).toHaveLength(0);
});


test('legacy three-step draft retains match, channel and selected players in the two-step route',async({page})=>{
 const {catalog,posts}=await setup(page);const key=`coachmate:round-preparation:availability@test:${catalog.teamSeasonId}`,rows=[{id:'legacy-draft',pool:'',date:'2030-11-10',shortDate:'10 nov',time:'10:00',opponent:'Legacy club',venue:'Uit',availabilityRound:2}];await page.evaluate(({key,rows})=>localStorage.setItem(key,JSON.stringify({round:2,step:2,rows,channel:'whatsapp',playerIds:['p01','p02']})),{key,rows});await page.reload({waitUntil:'domcontentloaded'});await nav(page).click();await page.getByRole('button',{name:/Voorbereiding hervatten/}).click();await expect(page.getByLabel('Tegenstander 1',{exact:true})).toHaveValue('Legacy club');await prepare(page);await expect(page.getByRole('tab',{name:'WhatsApp',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.locator('.invitation-recipient input:checked')).toHaveCount(2);expect(posts.filter(p=>p.path==='/api/forms/invite')).toHaveLength(0);
});

test('refresh preserves an unsaved live journal and blocks source replacement',async({page})=>{
 const {catalog,getState,posts}=await setup(page);const action={type:'toggle-clock' as const,now:Date.now()},state=coachReducer(getState(),action),key=journalKey('availability@test',catalog.teamSeasonId),journal={version:1,id:'availability-journal',account:'availability@test',teamSeasonId:catalog.teamSeasonId,revision:1,sourceToken:'fixed',actions:[action],state};await page.evaluate(({key,journal})=>localStorage.setItem(key,JSON.stringify(journal)),{key,journal});await page.reload({waitUntil:'domcontentloaded'});await nav(page).click();await page.getByRole('button',{name:/Nieuwe ronde voorbereiden/}).click();await expect(page.getByText('Wedstrijden vernieuwen lukt niet.',{exact:false})).toBeVisible();expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key)).toEqual(journal);expect(posts).toHaveLength(0);
});

for(const width of [320,390])test(`two-step preparation has a safe fixed header and reachable actions at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:740});await setup(page);await start(page);const dialog=page.getByRole('dialog');await expect(dialog.getByText('1/2',{exact:true})).toBeVisible();expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.getByRole('button',{name:'Opslaan en formulier voorbereiden',exact:true}).scrollIntoViewIfNeeded();const viewport=await dialog.locator('.preparation-scroll .mobile-scroll').boundingBox(),button=await page.getByRole('button',{name:'Opslaan en formulier voorbereiden',exact:true}).boundingBox();expect(button!.y+button!.height).toBeLessThanOrEqual(viewport!.y+viewport!.height+1);await prepare(page);await expect(dialog.getByText('2/2',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Sluiten',exact:true})).toBeVisible();expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});


for(const date of ['01-11-2030','1 november 2030'])test(`Sheets date ${date} works in the same preparation flow`,async({page})=>{
 const {posts,setSource}=await setup(page,{sheetRound:true});setSource(s=>({...s,catalog:{...s.catalog,matches:s.catalog.matches.map(m=>m.id==='sheet-match'?{...m,date}:m)}}));await page.getByRole('button',{name:/Nieuwe ronde voorbereiden/}).click();await page.getByRole('button',{name:'Imported club – 1 nov 2030',exact:true}).click();await expect(page.getByLabel('Datum 1',{exact:true})).toHaveValue('2030-11-01');await prepare(page);expect(posts.find(p=>p.path==='/api/action')!.data.action.matches[0].date).toBe('2030-11-01');expect(posts.filter(p=>p.path==='/api/forms/prepare')).toHaveLength(1);
});


test('existing form and source date notation are preserved when continuing to invitations',async({page})=>{
 const {posts,setSource,catalog}=await setup(page,{sheetRound:true});setSource(s=>({...s,catalog:{...s.catalog,matches:s.catalog.matches.map(m=>m.id==='sheet-match'?{...m,date:'1 november 2030'}:m)}}));
 const forms=[1,2].map(round=>({formId:`existing-${round}`,round,matchId:'',url:'https://docs.google.com/forms/d/e/fixture/viewform',codeEntryId:'123',prefillDefaults:'{"entry.456":"Aanwezig"}'}));
 await page.route(url=>url.hostname==='127.0.0.1'&&url.port==='4175'&&url.pathname==='/api/forms',route=>route.fulfill({json:{forms,invites:forms.flatMap(f=>catalog.players.map(p=>({formId:f.formId,playerId:p.id,code:'code-'+p.id,...(f.round===1&&p.id===catalog.players[0].id?{submittedAt:'2030-10-01T10:00:00Z'}:{})}))),deliveries:[],jobs:[],mailReady:true}}));
 await page.getByRole('button',{name:/Nieuwe ronde voorbereiden/}).click();await page.getByRole('button',{name:'Imported club – 1 nov 2030',exact:true}).click();await expect(page.getByLabel('Datum 1',{exact:true})).toHaveValue('2030-11-01');await expect(page.getByLabel('Datum 1',{exact:true})).toBeDisabled();await page.getByRole('button',{name:'Verder naar uitnodigen',exact:true}).click();await expect(page.getByRole('dialog').getByRole('heading',{name:'Uitnodigen',exact:true})).toBeVisible();expect(posts.filter(p=>p.path==='/api/action'||p.path==='/api/forms/prepare'||p.path==='/api/forms/invite')).toHaveLength(0);
});
