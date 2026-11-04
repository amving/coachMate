import {test,expect} from '@playwright/test';
import {createInitialState,demoCatalog,coachReducer} from '../src/coach-state';
const nav=(page:any,name:string)=>page.getByRole('navigation').getByRole('button',{name,exact:true});
async function mockGoogle(page:any, archived=false) {
 let state={...createInitialState(),catalog:{...demoCatalog(),teamSeasonId:'ux-team',archived}};
 let fail=true;
 await page.route('http://127.0.0.1:4175/**',async(route:any)=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/action') {
   if(fail) return route.fulfill({status:409,json:{error:'Bron gewijzigd'}});
   state=coachReducer(state,route.request().postDataJSON().action) as typeof state;
  }
  const data=path==='/api/session'?{configured:true,authenticated:true,email:'ux@test',csrf:'x'}:
   path==='/api/teams'?{teams:[{teamSeasonId:'ux-team',seasonId:state.catalog.seasonId,teamName:'Team'}],seasons:[{seasonId:state.catalog.seasonId,name:'Seizoen',archived}]}:
   ['/api/state','/api/action'].includes(path)?{state,revision:1,sourceToken:'x'}:{forms:[],invites:[]};
  await route.fulfill({json:data});
 });
 return ()=>{fail=false;};
}
test('draft survives tabs and reload and can be explicitly discarded',async({page})=>{
 await page.goto('/?device=real'); await nav(page,'Statistieken').click();
 await page.getByRole('button',{name:'Bekijk en corrigeer historische wedstrijdgegevens',exact:true}).click();
 await page.getByRole('button',{name:/14 sep/}).click();
 await page.getByRole('textbox',{name:'Daan minuten',exact:true}).fill('37,5');
 await expect(page.getByRole('textbox',{name:'Daan minuten',exact:true})).toHaveValue('37,5');
 await nav(page,'Overzicht').click(); await nav(page,'Statistieken').click();
 await expect(page.getByRole('textbox',{name:'Daan minuten',exact:true})).toHaveValue('37,5');
 await page.reload(); await nav(page,'Statistieken').click(); await page.getByRole('button',{name:'Bekijk en corrigeer historische wedstrijdgegevens',exact:true}).click();
 await page.getByRole('button',{name:/FC Waterwijk · Concept hervatten/}).click();
 await expect(page.getByRole('textbox',{name:'Daan minuten',exact:true})).toHaveValue('37,5');
 await page.getByRole('button',{name:'Terug',exact:true}).click();
 await page.getByRole('button',{name:'Dit concept verwerpen',exact:true}).click();
 await expect(page.getByRole('button',{name:/Concept hervatten/})).toHaveCount(0);
});
test('failed Google save keeps draft and editor, retry commits only after success',async({page})=>{
 const succeed=await mockGoogle(page); await page.goto('/'); await expect(page.locator('.coach-app')).toHaveAttribute('data-source','google');
 await nav(page,'Statistieken').click(); await page.getByRole('button',{name:'Bekijk en corrigeer historische wedstrijdgegevens',exact:true}).click();
 await page.getByRole('button',{name:/14 sep/}).click();
 await page.getByRole('textbox',{name:'Daan goals',exact:true}).fill('3');
 await page.getByRole('button',{name:'Opslaan',exact:true}).click();
 await expect(page.getByText(/Je concept is behouden/)).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Daan goals',exact:true})).toHaveValue('3');
 succeed(); await page.getByRole('button',{name:'Opslaan',exact:true}).click();
 await expect(page.getByRole('button',{name:'Opslaan',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Concept hervatten/})).toHaveCount(0);
});
test('archived history remains accessible but numbers are read only',async({page})=>{
 await mockGoogle(page,true); await page.goto('/'); await expect(page.getByText('Archief · alleen lezen')).toBeVisible();
 await nav(page,'Statistieken').click(); await page.getByRole('button',{name:'Bekijk en corrigeer historische wedstrijdgegevens',exact:true}).click();
 await page.getByRole('button',{name:/14 sep/}).click();
 await expect(page.getByRole('textbox',{name:'Daan minuten',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Opslaan',exact:true})).toBeDisabled();
});
test('invalid half-minute input cannot be saved',async({page})=>{
 await page.goto('/'); await nav(page,'Statistieken').click(); await page.getByRole('button',{name:'Bekijk en corrigeer historische wedstrijdgegevens',exact:true}).click();
 await page.getByRole('button',{name:/14 sep/}).click();
 await page.getByRole('textbox',{name:'Daan minuten',exact:true}).fill('70');
 await page.getByRole('button',{name:'Opslaan',exact:true}).click();
 await expect(page.getByText('Controleer de gemarkeerde getallen voordat je opslaat.')).toBeVisible();
});

test('Google match picker prepares a match without changing historical results',async({page})=>{
 let state={...createInitialState(),catalog:{...demoCatalog(),teamSeasonId:'picker-team',liveMatchId:''}};
 state.live.phase='Einde';
 await page.route('http://127.0.0.1:4175/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/action') { expect(route.request().postDataJSON().action.type).toBe('prepare-match'); state=coachReducer(state,route.request().postDataJSON().action) as typeof state; }
  const data=path==='/api/session'?{configured:true,authenticated:true,email:'picker@test',csrf:'x'}:
   path==='/api/teams'?{teams:[{teamSeasonId:'picker-team',seasonId:state.catalog.seasonId,teamName:'Team'}],seasons:[{seasonId:state.catalog.seasonId,name:'Seizoen',archived:false}]}:
   ['/api/state','/api/action'].includes(path)?{state,revision:1,sourceToken:'x'}:{forms:[],invites:[]};
  await route.fulfill({json:data});
 });
 await page.goto('/'); await expect(page.locator('.coach-app')).toHaveAttribute('data-source','google');
 await nav(page,'Live').click(); await page.getByLabel('Live wedstrijd kiezen').selectOption('m-028');
 await page.getByRole('button',{name:'Deze wedstrijd voorbereiden',exact:true}).click();
 await expect(page.getByTestId('score')).toHaveText('0 – 0');
 expect(state.catalog.liveMatchId).toBe('m-028'); expect(state.stats).toHaveLength(20);
 await page.reload(); await nav(page,'Live').click();
 await expect(page.getByText('ASC Nieuwland',{exact:true})).toBeVisible();
});

test('settings has its own page, grouped options and returns to the current draft',async({page})=>{
 await page.goto('/?device=real');
 await nav(page,'Statistieken').click();
 await page.getByRole('button',{name:'Bekijk en corrigeer historische wedstrijdgegevens',exact:true}).click();
 await page.getByRole('button',{name:/14 sep/}).click();
 await page.getByRole('textbox',{name:'Daan minuten',exact:true}).fill('37,5');
 await page.getByRole('button',{name:'Instellingen openen',exact:true}).click();
 await expect(page.getByRole('main',{name:'Instellingen',exact:true})).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByLabel('Wedstrijdindeling',{exact:true})).toBeHidden();
 await page.getByText('Team en wedstrijd',{exact:true}).click();
 await expect(page.getByLabel('Wedstrijdindeling',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Terug naar app',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Daan minuten',exact:true})).toHaveValue('37,5');
});
