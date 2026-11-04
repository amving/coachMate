import {test,expect} from '@playwright/test';
import {createInitialState,coachReducer} from '../src/coach-state';
import {matchShareText} from '../src/match-share';

test('share text preserves venue, own goals and unknown minutes',()=>{
 const match={id:'m',pool:'',date:'2026-10-17',shortDate:'17 okt',time:'',opponent:'Opponent',venue:'Uit' as const,availabilityRound:2};
 const ours=[{playerId:'p',minute:7,ownGoal:false},{playerId:null,minute:null,ownGoal:true}];
 const theirs=[{playerId:'p',minute:8,ownGoal:true}];
 const text=matchShareText(match,'EDO JO10-2',ours,theirs,()=> 'Tijn');
 expect(text).toContain('Opponent 1–2 EDO JO10-2');expect(text).toContain('7′ · Tijn');expect(text).toContain('8′ · Eigen doelpunt Tijn');expect(text).toContain('Eigen doelpunt tegenstander');expect(text).not.toContain('null');
 expect(matchShareText({...match,venue:'Thuis'},'EDO JO10-2',ours,theirs,()=> 'Tijn')).toContain('EDO JO10-2 2–1 Opponent');
 expect(matchShareText(match,'EDO',[],[],()=> '')).toContain('Geen doelpunten.');
});

test('only successful processing offers a manual WhatsApp message and keeps it accessible',async({page})=>{
 let state=createInitialState();state=coachReducer(state,{type:'goal',playerId:'p02',now:1000});
 await page.addInitScript(s=>localStorage.setItem('coachmate:v1',JSON.stringify(s)),state);
 await page.setViewportSize({width:390,height:844});await page.goto('/?device=real');await page.getByRole('navigation').getByRole('button',{name:'Live',exact:true}).click();
 await expect(page.getByRole('link',{name:'Open in WhatsApp',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Wedstrijddata verwerken',exact:true}).click();
 await page.getByRole('button',{name:'Afsluiten en verwerken',exact:true}).click();
 const link=page.getByRole('link',{name:'Open in WhatsApp',exact:true});await expect(link).toBeVisible();
 const href=await link.getAttribute('href');expect(href).toMatch(/^https:\/\/wa.me\/\?text=/);expect(decodeURIComponent(href!)).toContain('Mats');expect(decodeURIComponent(href!)).toContain('Eindstand');
 await page.getByRole('button',{name:'Sluiten',exact:true}).click();await page.getByRole('button',{name:'Deel eindstand via WhatsApp',exact:true}).click();await expect(link).toBeVisible();
 await page.waitForTimeout(450);await page.screenshot({path:'outputs/match-whatsapp-share.png'});
});
