import {test,expect} from '@playwright/test';
import {createInitialState,demoCatalog,LIVE_MATCH_ID} from '../src/coach-state';
test('team field size updates lineup and reserve advice after reload',async({page})=>{
 const state=createInitialState();state.catalog=demoCatalog();state.catalog.matches=state.catalog.matches.map(m=>m.id===LIVE_MATCH_ID?{...m,date:'2030-10-10'}:m);for(const id of Object.keys(state.availability[LIVE_MATCH_ID]))state.availability[LIVE_MATCH_ID][id]='available';
 await page.addInitScript(s=>{if(!localStorage.getItem('coachmate:v1'))localStorage.setItem('coachmate:v1',JSON.stringify(s));},state);
 await page.goto('/?device=real');await expect(page.locator('.swap-count')).toContainText('4 wisselspelers');
 await page.getByRole('button',{name:'Instellingen openen'}).click();await page.getByText('Team en wedstrijd',{exact:true}).click();await page.getByLabel('Spelers op het veld',{exact:true}).selectOption('8');await expect(page.getByLabel('Huidige periode')).toHaveCount(0);
 await page.reload();await page.getByRole('navigation').getByRole('button',{name:'Overzicht',exact:true}).click();await expect(page.locator('.swap-count')).toContainText('2 wisselspelers');
 await page.getByRole('navigation').getByRole('button',{name:'Live',exact:true}).click();await expect(page.locator('.roster-columns > div').first().locator('.roster-player')).toHaveCount(8);
 await page.getByRole('button',{name:'Instellingen openen'}).click();await page.getByText('Team en wedstrijd',{exact:true}).click();await page.getByLabel('Spelers op het veld',{exact:true}).selectOption('11');await page.getByRole('button',{name:'Terug naar app',exact:true}).click();await expect(page.locator('.roster-columns > div').first().locator('.roster-player')).toHaveCount(10);
});
