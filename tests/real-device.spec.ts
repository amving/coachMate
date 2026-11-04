import { test, expect } from '@playwright/test';

test('real phone fills screen, uses native inputs and preserves navigation and sheets', async ({ browser }) => {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.getByTestId('real-device-screen')).toBeVisible();
  await expect(page.getByTestId('phone-frame')).toHaveCount(0);
  await expect(page.getByLabel('Device status bar')).toHaveCount(0);
  const rect=await page.getByTestId('real-device-screen').boundingBox();
  expect(rect?.width).toBe(390); expect(rect?.height).toBe(844);
  await page.getByRole('navigation').getByRole('button',{name:'Statistieken',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Spelersstatistieken'})).toBeVisible();
  await page.getByRole('button',{name:'Bekijk en corrigeer historische wedstrijdgegevens',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.history-screen')).toBeVisible();
  await expect(page.locator('.app-header').getByRole('button',{name:'Terug',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Instellingen openen'}).click();
  await expect(page.getByRole('main',{name:'Instellingen'})).toBeVisible();
  expect(await page.locator('.keyboard-dock').count()).toBe(0);
  await context.close();
});

test('web app manifest and iPhone icon are served',async({request})=>{
  const manifest=await request.get('/manifest.webmanifest');
  const data=await manifest.json(); expect(data.display).toBe('standalone');
  expect(data.start_url).toBe('/?device=real');
  for(const icon of data.icons) expect((await request.get(icon.src)).status()).toBe(200);
  expect((await request.get('/icons/apple-touch-icon.png')).status()).toBe(200);
});

test('iPhone sheet dismisses with a downward touch swipe and with close button',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  await page.route('http://127.0.0.1:4175/**',route=>route.fulfill({json:{configured:true,authenticated:false}}));
  await page.goto('http://127.0.0.1:4173/');
  await page.getByRole('navigation').getByRole('button',{name:'Live',exact:true}).click();
  await page.getByRole('button',{name:/Goal voor Speler/}).click();
  const handle=page.getByTestId('sheet-handle');
  await expect(handle).toBeVisible();
  await page.waitForTimeout(400);
  const box=(await handle.boundingBox())!;
  const cdp=await context.newCDPSession(page);
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=8;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+i*16}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:/Goal voor Speler/}).click();
  await page.getByRole('button',{name:'Sluiten',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await context.close();
});
