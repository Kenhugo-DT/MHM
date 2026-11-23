import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
});

test("map opens with a rendered canvas and a working layout selector", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator(".graph-map canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).width)).toBeGreaterThan(0);

  const layout = page.getByRole("combobox", { name: "Map layout" });
  await expect(layout).toBeEnabled();
  await layout.selectOption("timeline");
  await expect(layout).toHaveValue("timeline");
  await layout.selectOption("genre");
  await expect(layout).toHaveValue("genre");
});

test("search selects a node and opens its details", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Search the entire map" }).fill("Eric Clapton");
  await page.locator(".search-results button").filter({ hasText: "Eric Clapton" }).first().click();
  await expect(page.locator(".detail-heading h2")).toHaveText("Eric Clapton");
  await expect(page).toHaveURL(/node=eric-clapton/);
});

test("legacy connections without evidence are identified in details", async ({ page }) => {
  await page.goto("/?node=blues");
  await expect(page.locator(".detail-heading h2")).toHaveText("Blues");
  await expect(page.locator(".connection-evidence").first()).toHaveText("Unverified link");
});

test("the text directory finds a node and opens it on the map", async ({ page }) => {
  await page.goto("/directory.html");
  await expect(page.getByRole("heading", { name: "Nodes" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search nodes" }).fill("Eric Clapton");
  await expect(page.locator(".directory-list li")).toHaveCount(1);
  await page.locator(".directory-list a").click();
  await expect(page.locator(".detail-heading h2")).toHaveText("Eric Clapton");
});
