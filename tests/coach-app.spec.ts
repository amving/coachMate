import { test, expect, type Page } from "@playwright/test";

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Hoofdnavigatie" }).getByRole("button", { name, exact: true });

test("scores persist across tabs and reload, undo removes exactly one, closing updates dashboard", async ({ page }) => {
  await page.goto("/");
  const originalGoals = Number(await page.getByTestId("total-goals").textContent());
  await nav(page, "Live").click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: /Goal voor/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Kies Mats" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Goal registreren", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await expect(page.getByTestId("score")).toHaveText("0 – 2");
  await page.getByRole("button", { name: "Laatste goal terug" }).click();
  await expect(page.getByTestId("score")).toHaveText("0 – 1");
  await nav(page, "Overzicht").click();
  await nav(page, "Live").click();
  await expect(page.getByTestId("score")).toHaveText("0 – 1");
  await page.reload();
  await nav(page, "Live").click();
  await expect(page.getByTestId("score")).toHaveText("0 – 1");
  await page.getByRole("button", { name: "Wedstrijddata verwerken", exact: true }).click();
  await page.getByRole("button", { name: "Afsluiten en verwerken" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Overzicht").click();
  await expect(page.getByTestId("total-goals")).toHaveText(String(originalGoals + 1));
  await expect(page.getByTestId("total-matches")).toHaveText("3");
});

test("viewing responses is read-only until a status is explicitly changed", async ({ page }) => {
  await page.goto("/");
  await nav(page, "Beschikbaarheid").click();
  await page.getByRole("button", { name: "Bekijk reacties SV De Meer", exact: true }).click();
  await expect(page.getByLabel("Beschikbaarheid Milan")).toHaveValue("pending");
  await page.getByLabel("Beschikbaarheid Milan").selectOption("available");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Overzicht").click();
  await nav(page, "Beschikbaarheid").click();
  await expect(page.locator(".availability-match").filter({hasText:"SV De Meer"}).locator(".avail")).toContainText("7");
  await page.reload();
  await nav(page, "Beschikbaarheid").click();
  await page.getByRole("button", { name: "Bekijk reacties SV De Meer", exact: true }).click();
  await expect(page.getByLabel("Beschikbaarheid Milan")).toHaveValue("available");
});

test("existing statistics load per match and saved corrections update totals persistently", async ({ page }) => {
  await page.goto("/");
  const originalGoals = Number(await page.getByTestId("total-goals").textContent());
  await nav(page, "Statistieken").click();
  await page.getByRole("button", { name: "Bekijk en corrigeer historische wedstrijdgegevens", exact: true }).click();
  await page.getByRole("button", { name: /14 sep/ }).click();
  await expect(page.getByRole("textbox", { name: "Daan keeperminuten", exact: true })).toHaveValue("24");
  await page.getByLabel("Wedstrijd voor statistieken").selectOption("m-005");
  await expect(page.getByRole("textbox", { name: "Daan keeperminuten", exact: true })).toHaveValue("42");
  await page.getByRole("button", { name: "Daan goals verhogen", exact: true }).click();
  await page.getByLabel("Wedstrijd voor statistieken").selectOption("m-014");
  await expect(page.getByRole("textbox", { name: "Daan keeperminuten", exact: true })).toHaveValue("24");
  await page.getByLabel("Wedstrijd voor statistieken").selectOption("m-005");
  await page.getByRole("button", { name: "Opslaan", exact: true }).click();
  await nav(page, "Overzicht").click();
  await expect(page.getByTestId("total-goals")).toHaveText(String(originalGoals + 1));
  await page.reload();
  await expect(page.getByTestId("total-goals")).toHaveText(String(originalGoals + 1));
});

test("corrupt storage is retained instead of replaced with demo values", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("coachmate:v1", "corrupt backup"));
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("niet overschreven");
  expect(await page.evaluate(() => localStorage.getItem("coachmate:v1"))).toBe("corrupt backup");
});

test("storage failure is visible and the app remains usable in memory", async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); }; });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Opslaan lukt niet");
  await nav(page, "Live").click();
  await page.getByRole("button", { name: /Tegengoal Tegenstander/ }).click();
  await page.getByRole("button", { name: "Tegengoal registreren", exact: true }).click();
  await expect(page.getByTestId("score")).toHaveText("1 – 0");
});

test("team quarters setting persists and each of four quarters can be played", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Instellingen openen" }).click();
  await page.getByText("Team en wedstrijd", { exact: true }).click();
  await page.getByLabel("Wedstrijdindeling", { exact: true }).selectOption("4");
  await expect(page.getByLabel("Huidige periode")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await nav(page, "Live").click();
  await expect(page.getByTestId("match-phase")).toHaveText("1e kwart");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let period = 1; period < 4; period++) {
    await page.getByRole("button", { name: "Rust", exact: true }).click();
    await expect(page.getByTestId("match-phase")).toHaveText(`${period+1}e kwart · Rust`);
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByTestId("match-phase")).toHaveText(`${period + 1}e kwart`);
  }
  await page.getByRole("button", { name: "Affluiten", exact: true }).click();
  await page.getByRole("button", { name: "Afsluiten en verwerken" }).click();
  await expect(page.getByTestId("match-phase")).toHaveText("Einde");
});

test("own goals for either side persist, undo cleanly, and only increase the appropriate team total", async ({ page }) => {
  await page.goto("/");
  const originalGoals = Number(await page.getByTestId("total-goals").textContent());
  await nav(page, "Live").click();
  await page.getByRole("button", { name: /Goal voor/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Eigen doelpunt", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Goal registreren", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /Tegengoal Tegenstander/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Eigen doelpunt", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Kies Mats", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Tegengoal registreren", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("score")).toHaveText("1 – 1");
  await page.reload();
  await nav(page, "Live").click();
  await expect(page.getByTestId("score")).toHaveText("1 – 1");
  await expect(page.getByTestId("goals-for")).toContainText("Eigen doelpunt tegenstander");
  await expect(page.getByTestId("goals-against")).toContainText("MatsEigen doelpunt");
  await page.getByRole("button", { name: "Tegengoal terugnemen", exact: true }).click();
  await expect(page.getByTestId("score")).toHaveText("0 – 1");
  await expect(page.getByTestId("goals-against")).toBeEmpty();
  await page.getByRole("button", { name: "Laatste goal terug", exact: true }).click();
  await expect(page.getByTestId("score")).toHaveText("0 – 0");
  await page.getByRole("button", { name: /Goal voor/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Eigen doelpunt", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Goal registreren", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Wedstrijddata verwerken", exact: true }).click();
  await page.getByRole("button", { name: "Afsluiten en verwerken" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Overzicht").click();
  await expect(page.getByTestId("total-goals")).toHaveText(String(originalGoals + 1));
  await nav(page, "Statistieken").click();
  await page.getByText("Notes",{exact:true}).click();
  await expect(page.getByText(/Eigen doelpunten tegenstander: 1/)).toBeVisible();
});

test("header and navigation stay fixed while scrolling, and the console stays clean", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await nav(page, "Live").click();
  const header = page.locator(".app-header");
  const before = await header.boundingBox();
  await page.getByRole("button", { name: "Wedstrijddata verwerken", exact: true }).scrollIntoViewIfNeeded();
  const after = await header.boundingBox();
  expect(after?.y).toBe(before?.y);
  await expect(nav(page, "Statistieken")).toBeInViewport();
  expect(errors).toEqual([]);
});

test('historical response selectors are read-only',async({page})=>{
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button',{name:'Beschikbaarheid',exact:true}).click();
  await page.getByRole('button',{name:'Historie',exact:true}).click();
  await page.getByRole('button',{name:'Bekijk reacties FC Waterwijk',exact:true}).click();
  await expect(page.getByLabel('Beschikbaarheid Mats')).toHaveCount(0);
  await expect(page.getByRole('dialog').locator('.read-status')).toHaveCount(10);
  await expect(page.getByRole('dialog')).toContainText('Historische wedstrijd');
});
