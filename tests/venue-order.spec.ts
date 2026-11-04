import {test,expect} from '@playwright/test';
import {createInitialState,demoCatalog,LIVE_MATCH_ID} from '../src/coach-state';
for(const venue of ['Thuis','Uit'] as const) test(`${venue}: score order and saved goals remain correctly attributed`,async({page})=>{
 const state=createInitialState();state.catalog=demoCatalog();state.catalog.matches=state.catalog.matches.map(m=>m.id===LIVE_MATCH_ID?{...m,venue}:m);
 await page.addInitScript(s=>localStorage.setItem('coachmate:v1',JSON.stringify(s)),state);
 await page.goto('/?device=real');await page.getByRole('navigation').getByRole('button',{name:'Live',exact:true}).click();
 await page.getByRole('button',{name:/Goal voor/}).click();await page.getByRole('button',{name:'Kies Mats',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Goal registreren',exact:true}).click();
 await expect(page.getByTestId('score')).toHaveText(venue==='Thuis'?'1 – 0':'0 – 1');
 await expect(page.locator('.live-score-row > div:first-child').first()).toContainText(venue==='Thuis'?'JO10-1':'SV De Meer');
 await page.getByRole('button',{name:'Wedstrijddata verwerken',exact:true}).click();await page.getByRole('button',{name:'Afsluiten en verwerken',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('coachmate:v1')!));
 expect(saved.liveArchive[LIVE_MATCH_ID].goals.length).toBe(1);expect(saved.liveArchive[LIVE_MATCH_ID].awayGoals.length).toBe(0);
 expect(saved.stats.find((r:any)=>r.matchId===LIVE_MATCH_ID &&r.playerId==='p02').goals).toBe(1);
});


