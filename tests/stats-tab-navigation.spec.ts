import {test,expect,type Page} from '@playwright/test';
import {createInitialState,demoCatalog} from '../src/coach-state';
const nav=(page:Page,name:string)=>page.getByRole('navigation').getByRole('button',{name,exact:true});
test.use({viewport:{width:390,height:844}});
async function open(page:Page){
 const state={...createInitialState(),catalog:demoCatalog()};
 await page.route('http://127.0.0.1:4175/**',route=>route.fulfill({json:{configured:false,authenticated:false}}));
 await page.addInitScript(s=>{if(!localStorage.getItem('coachmate:v1'))localStorage.setItem('coachmate:v1',JSON.stringify(s));},state);
 await page.goto('/?device=real');await nav(page,'Statistieken').click();
 await page.getByRole('button',{name:'Bekijk en corrigeer historische wedstrijdgegevens',exact:true}).click();
 return state;
}

test('switching tabs preserves history; reselecting the active Statistics tab returns to the overview and its top',async({page})=>{
 await open(page);await page.getByLabel('Wedstrijdhistorie zoeken',{exact:true}).fill('Waterwijk');
 await nav(page,'Live').click();await nav(page,'Statistieken').click();
 await expect(page.getByRole('heading',{name:'Wedstrijdhistorie',exact:true})).toBeVisible();await expect(page.getByLabel('Wedstrijdhistorie zoeken',{exact:true})).toHaveValue('Waterwijk');
 await nav(page,'Statistieken').click();await expect(page.locator('.cumulative-summary')).toBeVisible();await expect(page.getByRole('heading',{name:'Wedstrijdhistorie',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Terug',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Bekijk en corrigeer historische wedstrijdgegevens',exact:true}).click();await expect(page.getByLabel('Wedstrijdhistorie zoeken',{exact:true})).toHaveValue('Waterwijk');await nav(page,'Statistieken').click();
 await page.getByTestId('mobile-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;});expect(await page.getByTestId('mobile-scroll').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await nav(page,'Statistieken').click();await expect(async()=>expect(await page.getByTestId('mobile-scroll').evaluate(el=>el.scrollTop)).toBe(0)).toPass();
});

test('reselecting Statistics preserves typed player and own-goal drafts without processing them, including after reload',async({page})=>{
 const state=await open(page);await page.locator('.history-grouped-list .history-row').filter({hasText:'FC Waterwijk'}).click();
 await page.getByRole('button',{name:'Eigen doelpunten tegenstander verhogen',exact:true}).click();
 await page.getByRole('textbox',{name:'Daan minuten',exact:true}).fill('41,5');
 await nav(page,'Live').click();await nav(page,'Statistieken').click();await expect(page.getByLabel('Wedstrijd voor statistieken',{exact:true})).toHaveValue('m-014');await expect(page.getByRole('textbox',{name:'Daan minuten',exact:true})).toHaveValue('41,5');
 await nav(page,'Statistieken').click();await expect(page.locator('.cumulative-summary')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('coachmate:v1')!));expect(stored.stats).toEqual(state.stats);expect(stored.opponentOwnGoals).toEqual(state.opponentOwnGoals);
 await page.getByRole('button',{name:'Bekijk en corrigeer historische wedstrijdgegevens',exact:true}).click();await page.locator('.draft-list .history-row').filter({hasText:'FC Waterwijk'}).click();await expect(page.getByRole('textbox',{name:'Daan minuten',exact:true})).toHaveValue('41,5');await expect(page.getByRole('textbox',{name:'Eigen doelpunten tegenstander',exact:true})).toHaveValue('1');
 await nav(page,'Statistieken').click();await page.reload();await nav(page,'Statistieken').click();await page.getByRole('button',{name:'Bekijk en corrigeer historische wedstrijdgegevens',exact:true}).click();await page.locator('.draft-list .history-row').filter({hasText:'FC Waterwijk'}).click();await expect(page.getByRole('textbox',{name:'Daan minuten',exact:true})).toHaveValue('41,5');await expect(page.getByRole('textbox',{name:'Eigen doelpunten tegenstander',exact:true})).toHaveValue('1');
});

test('returning from Settings preserves history and explicit player match links still open the intended editor',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Instellingen openen',exact:true}).click();await nav(page,'Statistieken').click();await expect(page.getByRole('heading',{name:'Wedstrijdhistorie',exact:true})).toBeVisible();
 await nav(page,'Statistieken').click();await page.getByRole('button',{name:'Statistieken Siem',exact:true}).click();await page.locator('.profile-match').filter({hasText:'FC Waterwijk'}).click();await expect(page.locator('.player-match-detail')).toBeVisible();await page.getByRole('button',{name:'Cijfers wijzigen',exact:true}).click();await expect(page.getByLabel('Wedstrijd voor statistieken',{exact:true})).toHaveValue('m-014');
 await nav(page,'Live').click();await nav(page,'Statistieken').click();await expect(page.getByLabel('Wedstrijd voor statistieken',{exact:true})).toHaveValue('m-014');await nav(page,'Statistieken').click();await expect(page.locator('.cumulative-summary')).toBeVisible();
});


test('reselecting Statistics restores the framed screen after browser focus scrolls its clipped ancestor',async({page})=>{
 await page.setViewportSize({width:1100,height:1100});await page.goto('/?design=ios&venue=away&case=stats-reselect-frame');await nav(page,'Statistieken').click();
 const screen=page.getByTestId('device-screen');await screen.evaluate(el=>{el.scrollTop=338;});expect(await screen.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await nav(page,'Statistieken').click();await expect(async()=>expect(await screen.evaluate(el=>el.scrollTop)).toBe(0)).toPass();await expect(page.locator('.app-header')).toBeInViewport();await expect(page.locator('.cumulative-summary')).toBeInViewport();await expect(page.getByTestId('keyboard-dock')).toHaveAttribute('data-visible','false');
});
