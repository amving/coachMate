import {test,expect,type Page} from '@playwright/test';
import {createInitialState,demoCatalog, type CoachState} from '../src/coach-state';
const nav=(page:Page,name:string)=>page.getByRole('navigation').getByRole('button',{name,exact:true});
async function open(page:Page,change?:(state:CoachState)=>void){
 const state={...createInitialState(),catalog:demoCatalog()};state.catalog.matches=state.catalog.matches.map(m=>m.id===state.catalog.liveMatchId?{...m,date:'2030-10-10'}:m);change?.(state);
 await page.route('http://127.0.0.1:4175/**',r=>r.fulfill({json:{configured:false,authenticated:false}}));
 await page.addInitScript(s=>{if(!localStorage.getItem('coachmate:v1'))localStorage.setItem('coachmate:v1',JSON.stringify(s));},state);
 await page.goto('/?device=real');return state;
}
test.use({viewport:{width:390,height:844}});

test('dashboard schedule tabs route pending past figures to their own match and advice opens separately',async({page})=>{
 const state=await open(page,state=>{state.availability['m-021'].p03='available';state.availability['m-021'].p05='available';});await page.getByRole('button',{name:'Wisselvoorstel bekijken',exact:true}).click();await expect(page.getByRole('dialog')).toHaveAccessibleName('Wisselvoorstel');await expect(page.getByRole('dialog')).toContainText('Keeperminuten tellen niet mee');await page.getByRole('button',{name:'Sluiten',exact:true}).click();
 const upcoming=page.getByRole('tab',{name:/^Planning/});await upcoming.focus();await page.keyboard.press('ArrowRight');const overdue=page.getByRole('tab',{name:/^Te verwerken/});await expect(overdue).toBeFocused();await expect(overdue).toHaveAttribute('aria-selected','true');
 await page.locator('#dashboard-matches-panel-overdue').getByRole('button',{name:/ASC Nieuwland/}).click();await expect(page.getByLabel('Wedstrijd voor statistieken',{exact:true})).toHaveValue(state.catalog.matches.find(m=>m.opponent==='ASC Nieuwland')!.id);
});

test('ranking modes keep unknown values visible and player details open the correct editable match',async({page})=>{
 const initial=await open(page,state=>{const row=state.stats.find(r=>r.playerId==='p01'&&r.matchId==='m-005')!;row.minutesKnown=false;row.minutes=0;row.keeperMinutesKnown=false;row.keeperMinutes=0;});await nav(page,'Statistieken').click();
 await expect(page.getByRole('region',{name:'Cumulatieve statistieken'}).or(page.locator('[aria-label="Cumulatieve statistieken"]'))).toContainText('+?');
 await page.getByLabel('Rangschik op',{exact:true}).selectOption('minutes');const unknown=page.getByRole('button',{name:'Statistieken Daan',exact:true});await expect(unknown).toContainText('+?');await expect(page.locator('.interactive-ranking li').last()).toContainText('Daan');
 await page.getByLabel('Rangschik op',{exact:true}).selectOption('keeper');await expect(unknown).toContainText('+?');
 const ranking=page.getByRole('tab',{name:'Ranglijsten',exact:true});await ranking.focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('tab',{name:'Spelers 10',exact:true})).toBeFocused();await expect(page.locator('.statistics-player')).toHaveCount(10);await expect(page.getByRole('button',{name:'Statistieken Daan',exact:true})).toContainText('? min');
 await page.getByRole('button',{name:'Statistieken Daan',exact:true}).click();await expect(page.getByRole('dialog')).toHaveAccessibleName('Daan de Vries');await expect(page.locator('.profile-metrics')).toContainText('Speelminuten?');await expect(page.locator('.profile-metrics')).toContainText('Keeperminuten');await page.getByRole('button',{name:'Sluiten',exact:true}).click();await expect(page.getByRole('button',{name:'Statistieken Daan',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Statistieken Daan',exact:true}).click();await page.locator('.profile-match').filter({hasText:'FC Waterwijk'}).click();await expect(page.locator('.player-match-detail')).toBeVisible();await page.getByRole('button',{name:'Cijfers wijzigen',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByLabel('Wedstrijd voor statistieken',{exact:true})).toHaveValue('m-014');await expect(page.getByRole('textbox',{name:'Daan keeperminuten',exact:true})).toHaveValue('24');
 await page.getByRole('button',{name:'Daan goals verhogen',exact:true}).click();await nav(page,'Overzicht').click();await expect(page.getByTestId('total-goals')).toHaveText('5');await nav(page,'Statistieken').click();await expect(page.getByRole('textbox',{name:'Daan goals',exact:true})).toHaveValue('2');await page.getByRole('button',{name:'Opslaan',exact:true}).click();await expect(page.locator('.player-match-detail')).toBeVisible();await page.getByRole('button',{name:'Sluiten',exact:true}).click();
 await nav(page,'Overzicht').click();await expect(page.getByTestId('total-goals')).toHaveText('6');await page.reload();await expect(page.getByTestId('total-goals')).toHaveText('6');
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('coachmate:v1')!));expect(stored.stats.find((r:any)=>r.matchId==='m-005'&&r.playerId==='p01')).toEqual(initial.stats.find(r=>r.matchId==='m-005'&&r.playerId==='p01'));
});

test('historical availability is read-only and notes and history search remain reachable',async({page})=>{
 await open(page);await nav(page,'Beschikbaarheid').click();await page.getByRole('tab',{name:/^Historie/}).click();await page.getByRole('button',{name:'Bekijk reacties FC Waterwijk',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Historische reacties · alleen lezen');await expect(page.getByLabel('Beschikbaarheid Daan',{exact:true})).toHaveCount(0);await expect(page.locator('.read-status')).toHaveCount(10);
 await page.getByRole('button',{name:/^Wedstrijdcijfers bekijken/}).click();await expect(page.getByLabel('Wedstrijd voor statistieken',{exact:true})).toHaveValue('m-014');await page.getByRole('button',{name:'Terug',exact:true}).click();await page.getByLabel('Wedstrijdhistorie zoeken',{exact:true}).fill('Waterwijk');await expect(page.locator('.history-grouped-list .history-row')).toHaveCount(1);await page.getByRole('button',{name:'Zoekopdracht wissen',exact:true}).click();await expect(page.locator('.history-grouped-list .history-row')).toHaveCount(2);await page.getByRole('button',{name:'Terug',exact:true}).click();
 await page.getByRole('button',{name:'Notities Uitleg bij de statistieken',exact:true}).click();await expect(page.getByRole('dialog')).toHaveAccessibleName('Notities');await expect(page.getByRole('dialog')).toContainText('Onbekende minuten tellen niet als nul');await page.getByRole('button',{name:'Sluiten',exact:true}).click();await expect(page.getByRole('button',{name:'Notities Uitleg bij de statistieken',exact:true})).toBeFocused();
});

test('empty and archived seasons stay navigable without offering editable attendance',async({page})=>{
 await open(page,state=>{state.stats=[];state.catalog!.archived=true;});await nav(page,'Statistieken').click();await expect(page.getByText('Nog geen wedstrijdcijfers',{exact:true})).toBeVisible();await page.getByRole('tab',{name:'Spelers 10',exact:true}).click();await page.getByRole('button',{name:'Statistieken Daan',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Nog geen geregistreerde wedstrijden');await page.getByRole('button',{name:'Sluiten',exact:true}).click();
 await nav(page,'Beschikbaarheid').click();await page.getByRole('button',{name:'Bekijk reacties SV De Meer',exact:true}).click();await expect(page.getByLabel('Beschikbaarheid Daan',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Sluiten',exact:true}).click();await page.getByText('Speelrondes beheren',{exact:true}).click();await expect(page.getByRole('button',{name:'Nieuwe speelronde',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Wedstrijden toevoegen',exact:true})).toHaveCount(0);
});

test('all screens and attendance confirmations fit narrow phones and a calibrated desktop frame',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
 for(const width of [320,390,427]){
  await page.setViewportSize({width,height:844});
  for(const screen of ['Overzicht','Beschikbaarheid','Statistieken']){
   await nav(page,screen).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();const scroll=await page.getByTestId('mobile-scroll').boundingBox(),footer=await page.getByRole('navigation').boundingBox();expect(scroll!.y+scroll!.height).toBeLessThanOrEqual(footer!.y+0.5);
  }
  await nav(page,'Overzicht').click();await page.getByRole('button',{name:/^Aanwezigheid aanpassen/}).click();await page.getByLabel('Beschikbaarheid Daan',{exact:true}).selectOption('unavailable');await expect(page.getByRole('button',{name:'Wijzigingen verwerken',exact:true})).toBeInViewport();await expect(page.getByRole('button',{name:'Annuleren',exact:true})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await page.getByRole('button',{name:'Annuleren',exact:true}).click();await page.getByRole('button',{name:'Sluiten',exact:true}).click();
 }
 await page.setViewportSize({width:1100,height:1100});await page.goto('/');const screen=await page.getByTestId('device-screen').boundingBox();expect(screen!.width).toBe(393);expect(screen!.height).toBe(852);await nav(page,'Beschikbaarheid').click();await page.getByRole('button',{name:'Speelrondes beheren Wedstrijden en formulieren',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Speelrondes beheren Wedstrijden en formulieren',exact:true})).toBeInViewport();expect(errors).toEqual([]);
});

test('attendance ranking shows actual appearances against distinct processed team matches and updates after a correction',async({page})=>{
 await open(page,state=>{
  for(const row of state.stats){
   if(row.playerId==='p01'){row.present=true;row.minutes=0;row.keeperMinutes=0;row.minutesKnown=false;row.keeperMinutesKnown=false;}
   if(row.playerId==='p03'||(row.playerId==='p02'&&row.matchId==='m-014')){row.present=false;row.minutes=0;row.keeperMinutes=0;row.goals=0;}
  }
  // Planned/Form availability deliberately disagrees with actual attendance.
  for(const match of Object.values(state.availability))for(const id of Object.keys(match))match[id]='available';
 });
 await nav(page,'Statistieken').click();await page.getByLabel('Rangschik op',{exact:true}).selectOption({label:'Aanwezigheid'});
 const row=(name:string)=>page.getByRole('button',{name:`Statistieken ${name}`,exact:true});
 await expect(row('Daan').locator('.rank-value')).toHaveAttribute('aria-label','2 van 2 wedstrijden aanwezig');await expect(row('Mats').locator('.rank-value')).toHaveAttribute('aria-label','1 van 2 wedstrijden aanwezig');await expect(row('Levi').locator('.rank-value')).toHaveAttribute('aria-label','0 van 2 wedstrijden aanwezig');await expect(row('Daan')).not.toContainText('+?');
 const order=await page.locator('.interactive-ranking button > strong').allTextContents();expect(order[0]).toBe('Daan');expect(order.indexOf('Daan')).toBeLessThan(order.indexOf('Mats'));expect(order.indexOf('Mats')).toBeLessThan(order.indexOf('Levi'));
 await page.setViewportSize({width:320,height:640});await expect(row('Daan').locator('.rank-value')).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await nav(page,'Live').click();await nav(page,'Statistieken').click();await expect(page.getByLabel('Rangschik op',{exact:true})).toHaveValue('attendance');
 await row('Mats').click();await page.locator('.profile-match').filter({hasText:'VV Buitenveldert'}).click();await page.getByRole('button',{name:'Cijfers wijzigen',exact:true}).click();await page.getByRole('button',{name:'Mats aanwezig',exact:true}).click();await page.getByRole('button',{name:'Opslaan',exact:true}).click();await expect(page.locator('.player-match-detail')).toBeVisible();await page.getByRole('button',{name:'Sluiten',exact:true}).click();await expect(row('Mats').locator('.rank-value')).toHaveAttribute('aria-label','0 van 2 wedstrijden aanwezig');await expect(row('Daan').locator('.rank-value')).toHaveAttribute('aria-label','2 van 2 wedstrijden aanwezig');
});

test('attendance ranking stays empty until team match statistics are processed',async({page})=>{
 await open(page,state=>{state.stats=[];});await nav(page,'Statistieken').click();await page.getByLabel('Rangschik op',{exact:true}).selectOption('attendance');await expect(page.getByText('Nog geen wedstrijdcijfers',{exact:true})).toBeVisible();await expect(page.locator('.interactive-ranking')).toHaveCount(0);
});
