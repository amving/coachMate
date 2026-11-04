import {test,expect} from '@playwright/test';
import {createInitialState,demoCatalog} from '../src/coach-state';
test('response rounds only select read-only snapshots for the identified match',async({page})=>{
 const state=createInitialState();state.catalog=demoCatalog();state.catalog.matches=state.catalog.matches.map(m=>m.id==='m-021'?{...m,date:'2030-10-20'}:m);state.currentRound=1;state.rounds=[structuredClone(state.availability)];state.rounds[0]['m-021'].p01='unavailable';
 await page.route('http://127.0.0.1:4175/**',route=>route.fulfill({json:{configured:false,authenticated:false}}));await page.addInitScript(s=>localStorage.setItem('coachmate:v1',JSON.stringify(s)),state);
 await page.goto('/?device=real');await page.getByRole('navigation').getByRole('button',{name:'Beschikbaarheid',exact:true}).click();await page.getByRole('button',{name:'Bekijk reacties SV De Meer',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('SV De Meer');await expect(page.getByLabel('Beschikbaarheidsronde')).toBeHidden();await page.getByText('Eerdere antwoorden bekijken',{exact:true}).click();await page.getByLabel('Beschikbaarheidsronde').selectOption('0');
 await expect(page.getByLabel('Beschikbaarheid Mats',{exact:true})).toHaveCount(0);await expect(page.getByRole('dialog').locator('.read-status')).toHaveCount(10);await expect(page.getByRole('dialog').locator('.read-status').first()).toHaveText('Afwezig');await expect(page.getByRole('button',{name:'Aanpassen',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('coachmate:v1')!).availability)).toEqual(state.availability);
 await page.getByLabel('Beschikbaarheidsronde').selectOption('current');await page.getByRole('button',{name:'Aanpassen',exact:true}).click();await expect(page.getByLabel('Beschikbaarheid Mats',{exact:true})).toBeVisible();
});
