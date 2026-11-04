import { test, expect } from '@playwright/test';
import { createTeamState, demoCatalog } from '../src/coach-state';

test('Google team selection isolates seasons, shows conflicts, and leaves local demo intact', async ({ page }) => {
  let selected = '';
  const teams = ['a','b'].map((id, index) => ({ teamSeasonId: id, seasonId: id, teamName: `Team ${id}`, periods: 2, liveMatchId: 'm-021' }));
  const seasons = ['a','b'].map(id => ({ seasonId: id, name: `Seizoen ${id}`, archived: false }));
  await page.route('http://127.0.0.1:4175/**', async route => {
    const url = new URL(route.request().url());
    let data: unknown = {};
    if (url.pathname === '/api/session') data = { configured: true, authenticated: true, email: 'coach@example.test', csrf: 'test' };
    if (url.pathname === '/api/teams') data = { teams, seasons };
    if (url.pathname === '/api/forms') data = { forms: [], invites: [] };
    if (url.pathname === '/api/state') {
      selected = url.searchParams.get('team')!;
      const state = createTeamState({ ...demoCatalog(), teamSeasonId: selected, seasonId: selected, teamName: `Team ${selected}`, seasonName: `Seizoen ${selected}` });
      if (selected === 'a') state.opponentOwnGoals = { 'm-014': 3 };
      data = { state, revision: 1, sourceToken: selected };
    }
    if (url.pathname === '/api/action') {
      expect(route.request().postDataJSON().teamSeasonId).toBe(selected);
      await route.fulfill({ status: 409, json: { error: 'Andere coach heeft gewijzigd' } }); return;
    }
    await route.fulfill({ json: data });
  });
  await page.goto('/');
  const before = await page.evaluate(() => localStorage.getItem('coachmate:v1'));
  await page.getByRole('button', { name: 'Instellingen openen' }).click();
  await page.getByLabel('Seizoen en team').selectOption('a');
  await expect(page.getByRole('button', {name:'Gegevens vernieuwen'})).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('total-goals')).toHaveText('3');
  await page.getByRole('button', { name: 'Instellingen openen' }).click();
  await page.getByLabel('Seizoen en team').selectOption('b');
  await expect(page.getByRole('button', {name:'Gegevens vernieuwen'})).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('total-goals')).toHaveText('0');
  await page.getByRole('navigation').getByRole('button', {name:'Wedstrijd', exact:true}).click();
  await page.getByRole('button', {name:/Goal voor/}).click();
  await page.getByRole('dialog').getByRole('button', {name:'Kies Mats'}).click();await page.getByRole('dialog').getByRole('button',{name:'Goal registreren',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Andere coach');
  await expect(page.getByTestId('score')).toHaveText('0 – 0');
  expect(await page.evaluate(() => localStorage.getItem('coachmate:v1'))).toBe(before);
});

test('single Google team loads automatically on login and reload without demo live match',async({page})=>{
  const state=createTeamState({...demoCatalog(),teamSeasonId:'real-team',teamName:'JO10-2',liveMatchId:'',matches:[]});
  await page.route('http://127.0.0.1:4175/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    const data=path==='/api/session'?{configured:true,authenticated:true,email:'coach@test',csrf:'t'}:
      path==='/api/teams'?{teams:[{teamSeasonId:'real-team',teamName:'JO10-2',seasonId:state.catalog.seasonId}],seasons:[{seasonId:state.catalog.seasonId,name:state.catalog.seasonName,archived:false}]}:
      path==='/api/state'?{state,revision:1,sourceToken:'t'}:{forms:[],invites:[]};
    await route.fulfill({json:data});
  });
  await page.goto('/');
  await expect(page.locator('.coach-app')).toHaveAttribute('data-source','google');
  await page.getByRole('navigation').getByRole('button',{name:'Live',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Nog geen wedstrijd klaar'})).toBeVisible();
  await expect(page.getByText('SV De Meer',{exact:true})).toHaveCount(0);
  await page.reload();
  await page.getByRole('button',{name:'Instellingen openen'}).click();
  await expect(page.getByLabel('Seizoen en team')).toHaveValue('real-team');
});

