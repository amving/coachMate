import {test,expect} from '@playwright/test';
import {createTeamState,demoCatalog} from '../src/coach-state';
const api='http://127.0.0.1:4175';
const invitation='test_'.padEnd(43,'a');

test.use({viewport:{width:390,height:844}});
test('parents accept their link and update upcoming matches without coach access or Forms',async({page})=>{
 const calls:{path:string;payload:any}[]=[];
 const late={id:'past',date:'2030-05-04',time:'10:00',opponent:'Eerdere club',venue:'Uit',editable:false,processed:true,answer:'pending',version:null,updatedAt:null,actor:null,coachOverride:false,score:[1,2]};
 const next={...late,id:'upcoming',date:'2030-06-04',opponent:'Komende club',editable:true,processed:false,score:null};
 const child={linkId:'linked-child',name:'Kind uit test',number:10,teamName:'JO10 test',season:'2030',matches:[late,next]};
 let linked=false;
 await page.route(api+'/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  calls.push({path,payload:request.method()==='POST'?request.postDataJSON():undefined});
  if(path==='/api/parent/session')return route.fulfill({json:{authenticated:true,parentEnabled:true,role:'parent',csrf:'fixture'}});
  if(path==='/api/parent/claim'){linked=true;return route.fulfill({json:{ok:true}});}
  if(path==='/api/parent/answer'){
   const answer=request.postDataJSON();next.answer=answer.status;next.version='saved-v1';
  }
  return route.fulfill({json:{children:linked?[child]:[]}});
 });
 await page.goto('/?device=real&parent=1#uitnodiging='+invitation);
 await expect(page.getByRole('button',{name:'Kind koppelen',exact:true})).toBeVisible();
 expect(new URL(page.url()).hash).toBe('');
 await page.getByRole('button',{name:'Kind koppelen',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Kind uit test',exact:true})).toBeVisible();
 await expect(page.getByRole('navigation')).toHaveCount(0);
 const options=page.getByRole('group',{name:'Beschikbaarheid voor Komende club'});
 await options.getByRole('button',{name:'Afwezig',exact:true}).click();
 await expect(page.getByText('Huidige antwoord: Nog niet beslist',{exact:true})).toBeVisible();
 expect(calls.some(c=>c.path==='/api/parent/answer')).toBe(false);
 await page.getByRole('button',{name:'Antwoord opslaan',exact:true}).click();
 await expect(page.getByText('Beschikbaarheid opgeslagen voor Komende club.',{exact:true})).toBeVisible();
 await expect(page.getByText('Huidige antwoord: Afwezig',{exact:true})).toBeVisible();
 await page.getByText('Eerdere wedstrijden',{exact:true}).click();
 await expect(page.getByText('Eerdere club · 1–2',{exact:true})).toBeVisible();
 await expect(page.getByRole('group',{name:'Beschikbaarheid voor Eerdere club'})).toHaveCount(0);
 expect(calls.find(c=>c.path==='/api/parent/claim')?.payload).toEqual({code:invitation});
 expect(calls.find(c=>c.path==='/api/parent/answer')?.payload).toEqual({linkId:'linked-child',matchId:'upcoming',status:'unavailable',version:null});
 expect(calls.every(c=>c.path==='/api/parent'||c.path.startsWith('/api/parent/'))).toBe(true);
 await page.reload();
 await expect(page.getByText('Huidige antwoord: Afwezig',{exact:true})).toBeVisible();
});
test('coach creates a scoped parent link and can revoke the existing link',async({page})=>{
 const catalog=demoCatalog(),state=createTeamState(catalog,4,6);
 const parent='parent@example.test';
 const linkId='test-parent-link';
 let links=[{id:linkId,playerId:'p01',email:parent}];
 const createdUrl='https://coachmate.example.test/?parent=1#uitnodiging='+invitation;
 const adminPosts:{path:string;data:any}[]=[];
 const distribution={forms:[],invites:[],jobs:[],deliveries:[],mailReady:false};
 const match=catalog.matches[0];
 state.availability[match.id].p01='available';
 state.availability[match.id].p02='unavailable';
 const parentAnswers={[match.id+'/p01']:{status:'available',coachOverride:false}};
 const availabilitySources={[match.id+'/p01']:'Ouderportaal',[match.id+'/p02']:'Google Forms'};
 await page.route(api+'/**',async route=>{
  const op=route.request(),path=new URL(op.url()).pathname;
  if(op.method()==='POST')adminPosts.push({path,data:op.postDataJSON()});
  if(path==='/api/session')return route.fulfill({json:{configured:true,authenticated:true,role:'coach',email:'coach@example.test',csrf:'test',parentEnabled:true}});
  if(path==='/api/teams'||path==='/api/state')return route.fulfill({json:{state,revision:1,sourceToken:'test',teams:[catalog],seasons:[],distribution,parentPortalEnabled:true,parentAnswers,availabilitySources}});
  if(path==='/api/forms')return route.fulfill({json:distribution});
  if(path==='/api/parent-access/invite')return route.fulfill({json:{url:createdUrl,expiresAt:Date.now()+86400000}});
  if(path==='/api/parent-access/revoke')links=[];
  return route.fulfill({json:{links}});
 });
 await page.goto('/?device=real');
 await expect(page.locator('.coach-app')).toHaveAttribute('data-source','google');
 await page.getByRole('button',{name:'Instellingen openen',exact:true}).click();
 await page.locator('.settings-group > summary').filter({hasText:'Oudertoegang'}).click();
 await page.getByRole('combobox',{name:'Speler voor ouderuitnodiging',exact:true}).selectOption('p01');
 await page.getByLabel('Google-e-mailadres van de ouder',{exact:true}).fill(parent);
 await page.getByRole('button',{name:'Persoonlijke ouderlink maken',exact:true}).click();
 await expect(page.getByLabel('Persoonlijke ouderlink',{exact:true})).toHaveValue(createdUrl);
 await page.getByRole('button',{name:'Intrekken',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Oudertoegang intrekken'})).toBeVisible();
 await page.getByRole('button',{name:'Toegang intrekken',exact:true}).click();
 await expect(page.getByText('Oudertoegang ingetrokken.',{exact:true})).toBeVisible();
 expect(adminPosts).toEqual([
  {path:'/api/parent-access/invite',data:{teamSeasonId:catalog.teamSeasonId,playerId:'p01',email:parent}},
  {path:'/api/parent-access/revoke',data:{teamSeasonId:catalog.teamSeasonId,linkId}},
 ]);
 await page.getByRole('navigation').getByRole('button',{name:'Beschikbaarheid',exact:true}).click();
 await page.getByRole('button',{name:'Reacties bijwerken',exact:true}).click();
 await expect(page.getByText('Reacties bijgewerkt. Coachcorrecties blijven behouden.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Bekijk reacties '+match.opponent,exact:true}).click();
 const detail=page.getByRole('dialog');
 await expect(detail.locator('.response-row').filter({hasText:'Daan'})).toContainText('Ouderportaal');
 await expect(detail.locator('.response-row').filter({hasText:'Mats'})).toContainText('Google Forms');
 await detail.getByRole('button',{name:'Aanpassen',exact:true}).click();
 await expect(detail.getByLabel('Beschikbaarheid Daan')).toHaveValue('available');
 await expect(detail.getByLabel('Beschikbaarheid Mats')).toHaveValue('unavailable');
 expect(adminPosts).toHaveLength(2);
});
