import {test,expect,type Page} from '@playwright/test';
import {createInitialState,demoCatalog,type CoachState} from '../src/coach-state';

test.use({viewport:{width:390,height:844}});
const nav=(page:Page,name:string)=>page.getByRole('navigation').getByRole('button',{name,exact:true});
async function open(page:Page,venue:'Thuis'|'Uit'='Uit',change?:(state:CoachState)=>void){
 const state={...createInitialState(),catalog:structuredClone(demoCatalog())};
 state.catalog.matches=state.catalog.matches.map(m=>m.id===state.catalog.liveMatchId?{...m,venue}:m);change?.(state);
 await page.route('http://127.0.0.1:4175/**',r=>r.fulfill({json:{configured:false,authenticated:false}}));
 await page.addInitScript(s=>{if(!localStorage.getItem('coachmate:v1'))localStorage.setItem('coachmate:v1',JSON.stringify(s));},state);
 await page.goto('/?device=real');await nav(page,'Live').click();
}
const stored=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('coachmate:v1')!));

for(const venue of ['Thuis','Uit'] as const)test(`${venue}: clock action is centered and history follows goal order`,async({page})=>{
 await open(page,venue);
 const parts=page.locator('.goal-action-row').locator(':scope > *');
 await expect(parts).toHaveCount(3);await expect(parts.nth(1)).toHaveClass('match-start-row');
 const first=await parts.nth(0).boundingBox(),middle=await parts.nth(1).boundingBox(),last=await parts.nth(2).boundingBox();
 expect(first!.x+first!.width).toBeLessThan(middle!.x);expect(middle!.x+middle!.width).toBeLessThan(last!.x);
 await expect(page.locator('.history-team').first()).toHaveAttribute('data-side',venue==='Thuis'?'for':'against');
 await page.locator('.goal-action-column.ours .goal-action').click();
 await expect(page.getByRole('button',{name:'Goal registreren',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Kies Mats',exact:true}).click();
 expect((await stored(page)).live.goals).toHaveLength(0);
 await page.getByRole('button',{name:'Goal registreren',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByTestId('score')).toHaveText(venue==='Thuis'?'1 – 0':'0 – 1');
 await expect(page.getByTestId('goals-for')).toContainText('Mats');
 await expect(page.getByTestId('goals-for')).toContainText(venue==='Thuis'?'1–0':'0–1');
 await expect(page.getByRole('tab',{name:'Doelpunten 1',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('button',{name:'Laatste goal terug',exact:true}).click();
 await expect(page.getByTestId('goals-for')).toBeEmpty();
});

test('timer opens period detail, uses current-period time, and preserves unknown legacy times',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-16T18:30:00+02:00'));
 await open(page,'Uit',state=>{state.team.periods=4;state.live.periods=4;state.live.period=2;state.live.elapsedMs=720000;state.live.periodTimes={'4:1':600000,'4:2':120000};});
 await expect(page.getByTestId('match-clock')).toHaveText('02:00');await expect(page.locator('.timing-fold')).toHaveCount(0);
 const before=(await stored(page)).live;
 await page.getByRole('button',{name:'Bekijk wedstrijdtijden',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toHaveAccessibleName('Wedstrijdtijden');
 await expect(dialog.locator('.period-times > span')).toHaveCount(4);
 await expect(dialog.locator('.current-period')).toHaveText('2e kwart02:00');
 await expect(dialog.locator('.match-time-totals')).toContainText('12:00');
 await page.getByRole('button',{name:'Sluiten',exact:true}).click();await expect(dialog).toHaveCount(0);
 expect((await stored(page)).live).toEqual(before);
 await expect(page.getByRole('button',{name:'Bekijk wedstrijdtijden',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Start',exact:true}).click();await page.getByRole('button',{name:'Rust',exact:true}).click();await page.getByRole('button',{name:'Start',exact:true}).click();
 await expect(page.getByTestId('match-clock')).toHaveText('00:00');await expect(page.getByRole('button',{name:'Bekijk wedstrijdtijden',exact:true})).toContainText('3e kwart');
});

test('selection can be cancelled and own goals on both sides stay team-relative after reload',async({page})=>{
 await open(page);
 await page.locator('.ours .goal-action').click();await page.getByRole('button',{name:'Kies Mats',exact:true}).click();
 await page.getByRole('button',{name:'Sluiten',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect((await stored(page)).live.goals).toHaveLength(0);
 await page.locator('.ours .goal-action').click();await expect(page.getByRole('button',{name:'Kies Mats',exact:true})).toHaveAttribute('aria-pressed','false');
 await page.getByRole('button',{name:'Eigen doelpunt',exact:true}).click();await page.getByRole('button',{name:'Goal registreren',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.locator('.theirs .goal-action').click();await page.getByRole('button',{name:'Eigen doelpunt',exact:true}).click();await page.getByRole('button',{name:'Kies Mats',exact:true}).click();await page.getByRole('button',{name:'Tegengoal registreren',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByTestId('score')).toHaveText('1 – 1');
 await page.reload();await nav(page,'Live').click();
 const state=await stored(page);expect(state.live.goals).toHaveLength(1);expect(state.live.goals[0]).toMatchObject({ownGoal:true,playerId:null});expect(state.live.awayGoals[0]).toMatchObject({ownGoal:true,playerId:'p02'});
 await expect(page.getByTestId('goals-for')).toContainText('Eigen doelpunt tegenstander');await expect(page.getByTestId('goals-against')).toContainText('Mats');
 await page.getByRole('button',{name:'Tegengoal terugnemen',exact:true}).click();await expect(page.getByTestId('score')).toHaveText('0 – 1');
});

test('unified history tabs work with keyboard and show persistent structured substitutions',async({page})=>{
 await open(page);
 await page.getByRole('tab',{name:'Doelpunten 0',exact:true}).focus();await page.keyboard.press('ArrowRight');
 await expect(page.getByRole('tab',{name:'Wissels 0',exact:true})).toBeFocused();await expect(page.getByText('Nog geen wissels',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sleep Lucas',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Sleep Mats',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('tab',{name:'Wissels 1',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.locator('.swap-person').first()).toContainText('Naar de bankMats');await expect(page.locator('.swap-person.incoming')).toContainText('In het veldLucas');
 await expect(page.locator('.timing-fold, .goal-history')).toHaveCount(0);
 await page.reload();await nav(page,'Live').click();await page.getByRole('tab',{name:'Wissels 1',exact:true}).click();await expect(page.locator('.swap-timeline li')).toHaveCount(1);
});

test('eleven-player goal picker keeps confirmation reachable on a small phone',async({page})=>{
 await page.setViewportSize({width:320,height:640});
 await open(page,'Thuis',state=>{
  const extra={...state.catalog!.players[0],id:'p11',number:11,shortName:'Alexander',name:'Alexander Test'};
  state.catalog!.players.push(extra);state.team.fieldSize=11;state.live.field=state.catalog!.players.map(p=>p.id);
  for(const responses of Object.values(state.availability))responses.p11='available';
  for(const matchId of new Set(state.stats.map(row=>row.matchId)))state.stats.push({matchId,playerId:'p11',present:false,minutes:0,keeperMinutes:0,goals:0});
  for(const p of state.catalog!.players){state.availability[state.catalog!.liveMatchId][p.id]='available';state.live.played[p.id]={milliseconds:0,keeperMilliseconds:0};}
 });
 await page.locator('.ours .goal-action').click();await expect(page.locator('.scorer-option')).toHaveCount(11);
 await page.getByRole('button',{name:'Kies Alexander',exact:true}).click();await expect(page.getByRole('button',{name:'Goal registreren',exact:true})).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 await page.getByRole('button',{name:'Goal registreren',exact:true}).click();await expect(page.getByTestId('score')).toHaveText('1 – 0');
});

test('legacy unknown period and rest data is shown as unknown rather than invented',async({page})=>{
 await open(page,'Uit',state=>{state.live.elapsedMs=720000;delete state.live.periodTimes;delete state.live.breakMs;});
 await expect(page.getByTestId('match-clock')).toHaveText('—');await page.getByRole('button',{name:'Bekijk wedstrijdtijden',exact:true}).click();
 await expect(page.getByRole('dialog').locator('.period-times > span').first()).toHaveText('1e helft?');
 await expect(page.getByRole('dialog').locator('.match-time-totals')).toHaveText('Speeltijd12:00Rusttijd—Totale tijd—');
 await expect(page.getByRole('dialog')).toContainText('Eerdere tijd zonder periode-indeling: 12:00');
});

test('a quick double tap during the closing animation records each goal only once',async({page})=>{
 await open(page);
 await page.locator('.ours .goal-action').click();await page.getByRole('button',{name:'Kies Mats',exact:true}).click();await page.getByRole('button',{name:'Goal registreren',exact:true}).dblclick();
 await expect(page.getByRole('dialog')).toHaveCount(0);expect((await stored(page)).live.goals).toHaveLength(1);
 await page.locator('.theirs .goal-action').click();await page.getByRole('button',{name:'Tegengoal registreren',exact:true}).dblclick();
 await expect(page.getByRole('dialog')).toHaveCount(0);expect((await stored(page)).live.awayGoals).toHaveLength(1);
 await expect(page.getByTestId('score')).toHaveText('1 – 1');
});

test('goal picker follows the current field after a substitution, including the keeper',async({page})=>{
 await open(page);
 await page.locator('.ours .goal-action').click();
 await expect(page.getByRole('dialog').getByRole('button',{name:'Kies Mats',exact:true})).toBeVisible();
 await expect(page.getByRole('dialog').getByRole('button',{name:'Kies Lucas',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Sluiten',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Sleep Lucas',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Sleep Mats',exact:true}).focus();await page.keyboard.press('Enter');
 await page.locator('.ours .goal-action').click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('button',{name:'Kies Lucas',exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Kies Mats',exact:true})).toHaveCount(0);
 await expect(dialog.getByRole('button',{name:'Kies Noah',exact:true})).toHaveCount(0);
 await expect(dialog.getByRole('button',{name:'Kies Daan',exact:true})).toContainText('Keeper');
 await expect(dialog.locator('.scorer-option')).toHaveCount(6);
});

for(const framed of [true,false])test(`footer covers its entire safe area and the final action scrolls above it (${framed?'frame':'phone'})`,async({page})=>{
 await page.setViewportSize(framed?{width:1100,height:1100}:{width:390,height:844});
 await page.goto(`/?${framed?'':'device=real&'}design=ios&venue=away&case=footer-check`);
 const footer=page.getByRole('navigation');await expect(footer).toHaveCSS('background-color','rgb(255, 255, 255)');
 const cover=await footer.evaluate(el=>({height:parseFloat(getComputedStyle(el,'::after').height),background:getComputedStyle(el,'::after').backgroundColor}));
 expect(cover.height).toBe(framed?34:0);expect(cover.background).toBe('rgb(255, 255, 255)');
 if(framed){
  const blocked=await footer.evaluate(el=>{const b=el.getBoundingClientRect(),scale=b.width/(el as HTMLElement).offsetWidth;return document.elementFromPoint(b.left+20*scale,b.bottom+10*scale)?.closest('nav')===el;});
  expect(blocked).toBe(true);
 }
 await page.getByTestId('mobile-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 const action=page.getByRole('button',{name:'Wedstrijddata verwerken',exact:true});
 await expect(action).toBeInViewport();
 const a=await action.boundingBox(),n=await footer.boundingBox();expect(a!.y+a!.height).toBeLessThan(n!.y);
 if(framed)await page.getByTestId('device-screen').screenshot({path:'outputs/ios-live-refinement/footer-fixed.png'});
 await action.click();await expect(page.getByRole('dialog')).toHaveAccessibleName('Wedstrijd afsluiten?');
});

for(const mode of ['frame','keyboard','phone'] as const)test(`scrolling content is clipped above navigation (${mode})`,async({page})=>{
 await page.setViewportSize(mode==='phone'?{width:390,height:844}:{width:1100,height:1100});
 await page.goto(`/?${mode==='phone'?'device=real&':''}${mode==='keyboard'?'keyboard=1&':''}design=ios&venue=away&case=clip-check`);
 const scroll=page.getByTestId('mobile-scroll'),footer=page.getByRole('navigation');
 await expect(async()=>{const s=await scroll.boundingBox(),n=await footer.boundingBox();expect(s!.y+s!.height).toBeLessThanOrEqual(n!.y+0.5);}).toPass();
 await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight;});
 const action=page.getByRole('button',{name:'Wedstrijddata verwerken',exact:true});
 await expect(action).toBeInViewport();const a=await action.boundingBox(),n=await footer.boundingBox();expect(a!.y+a!.height).toBeLessThan(n!.y);
 if(mode==='frame')await page.getByTestId('device-screen').screenshot({path:'outputs/ios-live-refinement/footer-clipped.png'});
});
