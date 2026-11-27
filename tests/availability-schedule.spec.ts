import {expect,test} from '@playwright/test';
import {createTeamState,demoCatalog} from '../src/coach-state';

test('availability shows the next match across rounds and moves passed matches into the collapsed history',async({page})=>{
 const catalog=demoCatalog();
 const template=catalog.matches[0];
 catalog.liveMatchId='';
 catalog.matches=[
  {...template,id:'later',opponent:'Later vandaag',date:'2030-11-21',time:'14:00',availabilityRound:1},
  {...template,id:'after',opponent:'Volgende week',date:'28-11-2030',time:'09:00',availabilityRound:2},
  {...template,id:'played',opponent:'Al verwerkt',date:'2030-11-27',time:'10:00',availabilityRound:1},
  {...template,id:'next',opponent:'Eerst aan de beurt',date:'21 november 2030',time:'11:00',availabilityRound:2},
  {...template,id:'yesterday',opponent:'Van gisteren',date:'20-11-2030',time:'10:00',availabilityRound:1},
 ];
 const state=createTeamState(catalog,4,6);
 state.resultOnly={played:{goalsFor:2,goalsAgainst:1,events:[]}};
 await page.clock.install({time:new Date('2030-11-21T09:59:40Z')});
 await page.addInitScript(data=>localStorage.setItem('coachmate:v1',JSON.stringify(data)),state);
 await page.route('http://127.0.0.1:4175/**',route=>route.fulfill({json:{configured:false,authenticated:false}}));
 await page.goto('/?device=real');
 await page.getByRole('navigation').getByRole('button',{name:'Beschikbaarheid',exact:true}).click();
 const schedule=page.getByRole('region',{name:'Reacties per wedstrijd'});
 const history=schedule.locator('details');
 const visibleRows=schedule.getByRole('button',{name:/Bekijk reacties/});
 await expect(visibleRows).toHaveCount(3);
 await expect(visibleRows.first()).toHaveAccessibleName('Bekijk reacties Eerst aan de beurt');
 await expect(visibleRows.nth(1)).toHaveAccessibleName('Bekijk reacties Later vandaag');
 await expect(visibleRows.nth(2)).toHaveAccessibleName('Bekijk reacties Volgende week');
 await expect(history).not.toHaveAttribute('open','');
 await expect(history.locator('summary')).toHaveText(/Afgelopen wedstrijden\s*2/);
 await page.clock.fastForward(31_000);
 await expect(visibleRows).toHaveCount(2);
 await expect(visibleRows.first()).toHaveAccessibleName('Bekijk reacties Later vandaag');
 await expect(history.locator('summary')).toHaveText(/Afgelopen wedstrijden\s*3/);
 await history.locator('summary').click();
 const pastRows=history.getByRole('button',{name:/Bekijk reacties/});
 await expect(pastRows).toHaveCount(3);
 await expect(pastRows.nth(1)).toHaveAccessibleName('Bekijk reacties Eerst aan de beurt');
 await expect(pastRows.nth(1)).toContainText('Nog niet verwerkt');
 await expect(pastRows.nth(2)).toHaveAccessibleName('Bekijk reacties Van gisteren');
 await history.getByRole('button',{name:'Bekijk reacties Al verwerkt',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('Historische reacties · alleen lezen');
 await expect(page.getByRole('button',{name:'Aanpassen',exact:true})).toHaveCount(0);
});
