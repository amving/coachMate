import {test,expect,type Page} from '@playwright/test';
const draft='Wil je vóór vrijdag de beschikbaarheid van {shortName} doorgeven?';
async function open(page:Page,mode:'iphone'|'pixel'|'real'='iphone'){
 await page.setViewportSize(mode==='real'?{width:390,height:844}:{width:869,height:884});
 await page.goto('/?design=assistant&case=invitation-header-'+mode+(mode==='real'?'&device=real':''),{waitUntil:'domcontentloaded'});
 if(mode==='pixel'){await page.getByTestId('device-picker').click();await page.getByTestId('device-option-pixel-10').click();}
 await page.getByRole('navigation',{name:'Hoofdnavigatie'}).getByRole('button',{name:'Beschikbaarheid',exact:true}).click();
 await page.getByRole('button',{name:'Uitnodigingen beheren',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Uitnodigingen',exact:true})).toBeVisible();
}
async function headerAt(page:Page,top:number){
 await expect.poll(async()=>{const box=await page.locator('.availability-page .preparation-toolbar').boundingBox();return box?Math.abs(box.y-top):Infinity;}).toBeLessThan(1);
}
for(const mode of ['iphone','pixel','real'] as const)test(`${mode}: invitation header and buttons stay in place through text focus and Tab`,async({page})=>{
 await open(page,mode);
 const header=page.locator('.availability-page .preparation-toolbar'),before=await header.boundingBox();expect(before).not.toBeNull();
 const screen=page.getByTestId(mode==='real'?'real-device-screen':'device-screen');
 const screenBox=await screen.boundingBox();expect(before!.y).toBeGreaterThanOrEqual(screenBox!.y);
 if(mode!=='real'){
  const scale=await screen.evaluate(el=>el.getBoundingClientRect().width/(el as HTMLElement).offsetWidth);
  expect(before!.y-screenBox!.y).toBeGreaterThanOrEqual((mode==='iphone'?54:64)*scale-1);
 }
 if(mode!=='real'){await screen.evaluate(el=>{el.scrollTop=54;});await expect.poll(()=>screen.evaluate(el=>el.scrollTop)).toBe(0);await headerAt(page,before!.y);}
 const input=page.getByLabel('Uitnodigingstekst',{exact:true});await input.scrollIntoViewIfNeeded();await input.click();await input.fill(draft);await headerAt(page,before!.y);
 if(mode!=='real'){await expect(page.getByTestId('keyboard-dock')).toHaveAttribute('data-visible','true');expect(await screen.evaluate(el=>el.scrollTop)).toBe(0);}
 await input.press('Tab');await headerAt(page,before!.y);
 if(mode!=='real'){await expect(page.getByTestId('keyboard-dock')).toHaveAttribute('data-visible','false');expect(await screen.evaluate(el=>el.scrollTop)).toBe(0);}
 const close=await page.getByRole('button',{name:'Sluiten',exact:true}).boundingBox();expect(close).not.toBeNull();
 await page.mouse.click(close!.x+close!.width/2,close!.y+close!.height/2);await expect(page.locator('.availability-page')).toHaveCount(0);
 await page.getByRole('button',{name:'Uitnodigingen beheren',exact:true}).click();await expect(page.getByLabel('Uitnodigingstekst',{exact:true})).toHaveValue(draft);
 const back=await page.getByRole('button',{name:'Terug',exact:true}).boundingBox();await page.mouse.click(back!.x+back!.width/2,back!.y+back!.height/2);await expect(page.locator('.availability-page')).toHaveCount(0);
 if(mode!=='real'){await expect(page.getByTestId('keyboard-dock')).toHaveAttribute('data-visible','false');expect(await screen.evaluate(el=>el.scrollTop)).toBe(0);}
});

for(const button of ['Terug','Sluiten'])test(`iPhone ${button} dismisses the keyboard and page directly while editing`,async({page})=>{
 await open(page);const input=page.getByLabel('Uitnodigingstekst',{exact:true});await input.fill(draft);await expect(page.getByTestId('keyboard-dock')).toHaveAttribute('data-visible','true');
 await page.getByRole('button',{name:button,exact:true}).click();await expect(page.locator('.availability-page')).toHaveCount(0);await expect(page.getByTestId('keyboard-dock')).toHaveAttribute('data-visible','false');
 await page.getByRole('button',{name:'Uitnodigingen beheren',exact:true}).click();await expect(page.getByLabel('Uitnodigingstekst',{exact:true})).toHaveValue(draft);
 await page.screenshot({path:`outputs/invitation-header-${button==='Terug'?'back':'close'}.png`});
});
