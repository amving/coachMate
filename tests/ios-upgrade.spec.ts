import {test,expect, type Page} from '@playwright/test';
import {createInitialState,demoCatalog} from '../src/coach-state';
test.use({viewport:{width:390,height:844},hasTouch:true});
const nav=(page:Page,name:string)=>page.getByRole('navigation').getByRole('button',{name,exact:true});
async function open(page:Page,venue:'Thuis'|'Uit'='Uit'){
 const state={...createInitialState(),catalog:demoCatalog()};state.catalog.matches=state.catalog.matches.map(m=>m.id===state.catalog.liveMatchId?{...m,venue,date:'2030-10-10'}:m);
 await page.route('http://127.0.0.1:4175/**',r=>r.fulfill({json:{configured:false,authenticated:false}}));
 await page.addInitScript(s=>{if(!localStorage.getItem('coachmate:v1'))localStorage.setItem('coachmate:v1',JSON.stringify(s));},state);
 await page.goto('/?device=real');await nav(page,'Live').click();
}
async function box(page:Page,selector:string){await page.locator(selector).scrollIntoViewIfNeeded();const b=await page.locator(selector).boundingBox();if(!b)throw Error('Missing control');return{x:b.x+b.width/2,y:b.y+b.height/2};}
for(const venue of ['Thuis','Uit'] as const)test(`goal buttons and undo follow ${venue} order without changing score attribution`,async({page})=>{
 await open(page,venue);await expect(page.locator('.goal-action-column').first()).toHaveAttribute('data-side',venue==='Thuis'?'ours':'theirs');
 const ours=await page.locator('.goal-action-column.ours').boundingBox(),theirs=await page.locator('.goal-action-column.theirs').boundingBox();expect(ours&&theirs&&(venue==='Thuis'?ours.x<theirs.x:ours.x>theirs.x)).toBeTruthy();
 await page.locator('.goal-action-column.ours .goal-action').click();await page.getByRole('dialog').getByRole('button',{name:'Kies Mats',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Goal registreren',exact:true}).click();await expect(page.getByTestId('score')).toHaveText(venue==='Thuis'?'1 – 0':'0 – 1');
 await page.getByRole('button',{name:'Laatste goal terug',exact:true}).click();await expect(page.getByTestId('score')).toHaveText('0 – 0');
 const widths=await nav(page,'Live').evaluate(el=>Array.from(el.parentElement!.children).map(e=>e.getBoundingClientRect().width));expect(Math.max(...widths)-Math.min(...widths)).toBeLessThan(1);expect(Math.min(...widths)).toBeGreaterThan(90);
});
test('mouse drag previews pair and swaps once, invalid drop does not swap, values survive reload',async({page})=>{
 await open(page);const from=await box(page,'[aria-label="Sleep Lucas"]'),target=await box(page,'[data-roster-id="p02"]');
 await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:12});await expect(page.locator('[data-roster-id="p02"]')).toHaveClass(/drop-target/);await expect(page.locator('.drop-preview')).toContainText('Lucas ↔ Mats');await page.mouse.up();
 await expect(page.locator('.field-roster [data-roster-id="p08"]')).toBeVisible();await expect(page.locator('.bench-roster [data-roster-id="p02"]')).toBeVisible();
 let state=await page.evaluate(()=>JSON.parse(localStorage.getItem('coachmate:v1')!));expect(state.live.swaps).toHaveLength(1);
 const again=await box(page,'[aria-label="Sleep Lucas"]');await page.mouse.move(again.x,again.y);await page.mouse.down();await page.mouse.move(8,80,{steps:8});await page.mouse.up();state=await page.evaluate(()=>JSON.parse(localStorage.getItem('coachmate:v1')!));expect(state.live.swaps).toHaveLength(1);
 await page.reload();await nav(page,'Live').click();await expect(page.locator('.field-roster [data-roster-id="p08"]')).toBeVisible();
});
test('native touch drag from field to bench preserves keeper identity, and touch cancel commits nothing',async({page})=>{
 await open(page);const source=await box(page,'[aria-label="Sleep Daan"]'),target=await box(page,'[data-roster-id="p08"]');const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[source]});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:source.x+(target.x-source.x)*i/8,y:source.y+(target.y-source.y)*i/8}]});await expect(page.locator('.drop-preview')).toContainText('Daan ↔ Lucas');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 let state=await page.evaluate(()=>JSON.parse(localStorage.getItem('coachmate:v1')!));expect(state.live.keeperId).toBe('p08');expect(state.live.swaps).toHaveLength(1);
 const start=await box(page,'[aria-label="Sleep Mats"]');await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+20,y:start.y+20}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});state=await page.evaluate(()=>JSON.parse(localStorage.getItem('coachmate:v1')!));expect(state.live.swaps).toHaveLength(1);await expect(page.locator('.dragged-player')).toHaveCount(0);
});
test('keyboard swaps and availability management remain accessible with no horizontal overflow',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Sleep Lucas',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Sleep Mats',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('.field-roster [data-roster-id="p08"]')).toBeVisible();
 await nav(page,'Beschikbaarheid').click();await expect(page.locator('.availability-list')).toBeVisible();await expect(page.getByRole('button',{name:'Nieuwe speelronde',exact:true})).not.toBeVisible();await page.getByText('Speelrondes beheren',{exact:true}).click();await expect(page.getByRole('button',{name:'Nieuwe speelronde',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sluiten',exact:true}).click();for(const name of ['Overzicht','Statistieken']){await nav(page,name).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();}
});

test('selected visual direction has a matching live drag capture at 390 by 844',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-16T18:38:24+02:00'));
 await page.goto('/?device=real&design=ios&venue=away&case=visual-evidence');
 const from=await box(page,'[aria-label="Sleep Lucas"]'),target=await box(page,'[data-roster-id="p02"]');
 await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:10});
 await expect(page.locator('.drop-preview')).toContainText('Lucas ↔ Mats');
 await page.screenshot({path:'outputs/ios-redesign/implementation-drag.png'});
 await page.keyboard.press('Escape');await page.mouse.up();
});

test('live targets and swap preview stay inside narrow and large phone screens',async({page})=>{
 await open(page);
 for(const width of [320,375,427]){
  await page.setViewportSize({width,height:844});
  const from=await box(page,'[aria-label="Sleep Lucas"]'),target=await box(page,'[data-roster-id="p02"]');
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:8});
  const preview=await page.locator('.drop-preview').boundingBox();expect(preview).not.toBeNull();expect(preview!.x).toBeGreaterThanOrEqual(0);expect(preview!.x+preview!.width).toBeLessThanOrEqual(width);
  await page.keyboard.press('Escape');await page.mouse.up();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 }
});

test('desktop phone frame keeps mobile roster density and readable player names',async({page})=>{
 await page.setViewportSize({width:1100,height:1100});
 await page.goto('/?design=ios&venue=away&case=desktop-check');
 const names=await page.locator('.roster-player-name strong').evaluateAll(els=>els.map(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width})));
 expect(names).toHaveLength(8);for(const name of names){expect(name.height).toBeLessThan(22);expect(name.width).toBeGreaterThan(30);}
 await page.screenshot({path:'outputs/ios-redesign/desktop-preview.png'});
});
