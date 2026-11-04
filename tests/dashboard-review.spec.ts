import {test,expect} from '@playwright/test';
import {createInitialState,demoCatalog,LIVE_MATCH_ID} from '../src/coach-state';
test('next match coach corrections persist and reconcile Live, with collapsible details',async({page})=>{
 const state=createInitialState(); state.catalog=demoCatalog();
 state.catalog.matches=state.catalog.matches.map(m=>m.id===LIVE_MATCH_ID ? {...m,date:'2030-01-10',shortDate:'10 jan'} : m);
 await page.addInitScript(s=>{if(!localStorage.getItem('coachmate:v1'))localStorage.setItem('coachmate:v1',JSON.stringify(s));},state);
 await page.goto('/?device=real');
 await expect(page.locator('.next-game-overview')).toContainText('SV De Meer');
 await expect(page.locator('.swap-suggestions')).toContainText('Wisselvoorstel'); await page.getByText('Aanwezigheid aanpassen',{exact:true}).click();
 await page.getByLabel('Beschikbaarheid Daan',{exact:true}).selectOption('unavailable'); await page.getByRole('button',{name:'Wijzigingen verwerken',exact:true}).click();
 await page.getByRole('navigation').getByRole('button',{name:'Beschikbaarheid',exact:true}).click(); await page.getByRole('button',{name:'Bekijk reacties SV De Meer',exact:true}).click(); await expect(page.getByLabel('Beschikbaarheid Daan',{exact:true})).toHaveValue('unavailable'); await page.getByRole('button',{name:'Sluiten',exact:true}).click();
 await page.getByRole('navigation').getByRole('button',{name:'Live',exact:true}).click();
 await expect(page.locator('.roster-player').filter({hasText:'Daan'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Keeper wijzigen: Daan',exact:true})).toHaveCount(0);
 await expect(page.locator('.fold-body').filter({hasText:'Afwezig:'}).first()).toContainText('Daan');
 await page.getByText('Opstelling en wissels',{exact:true}).click();
 await expect(page.locator('.roster-columns')).not.toBeVisible();
 await page.reload(); await page.getByText('Aanwezigheid aanpassen',{exact:true}).click();
 await expect(page.getByLabel('Beschikbaarheid Daan',{exact:true})).toHaveValue('unavailable');
 await page.getByRole('navigation').getByRole('button',{name:'Statistieken',exact:true}).click();
 for(const title of ['Ranglijsten','Spelersstatistieken','Notes']) {
  const fold=page.locator('details').filter({has:page.getByRole('heading',{name:title,exact:true})});
  await expect(fold).not.toHaveAttribute('open','');
  await fold.locator('summary').click(); await expect(fold).toHaveAttribute('open','');
 }
});
