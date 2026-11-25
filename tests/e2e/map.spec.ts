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
  const sourcedConnection = page.locator(".connection-item").filter({ hasText: "Blues rock" });
  await expect(sourcedConnection.getByRole("link", { name: "Source: Rock & Roll Hall of Fame" })).toHaveAttribute(
    "href",
    "https://rockhall.com/inductees/john-mayall/",
  );
});

test("a reviewed instrument connection shows its own source", async ({ page }) => {
  await page.goto("/?node=jimi-hendrix");
  await expect(page.locator(".detail-heading h2")).toHaveText("Jimi Hendrix");
  const instrument = page.locator(".connection-item").filter({ hasText: "Fender Stratocaster" });
  await expect(instrument.getByRole("link", { name: "Source: Fender: Jimi Hendrix Stratocaster" })).toHaveAttribute(
    "href",
    "https://www.fender.com/articles/instruments/artist-signature-specs-jimi-hendrix-stratocaster",
  );
  await expect(instrument.locator(".connection-evidence")).toHaveCount(0);
});

test("a newly connected artist exposes the reviewed band membership", async ({ page }) => {
  await page.goto("/?node=jack-black");
  await expect(page.locator(".detail-heading h2")).toHaveText("Jack Black");
  const membership = page.locator(".connection-item").filter({ hasText: "Tenacious D" });
  await expect(membership).toBeVisible();
  await expect(membership.getByRole("link", { name: "Source: MusicBrainz: member of band relationship" })).toHaveAttribute(
    "href",
    "https://musicbrainz.org/artist/caf8a53e-7f43-4be4-95d6-18d55e1f6e18/relationships",
  );
  await expect(membership.locator(".connection-evidence")).toHaveCount(0);
});

test("the text directory finds a node and opens it on the map", async ({ page }) => {
  await page.goto("/directory.html");
  await expect(page.getByRole("heading", { name: "Nodes" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search nodes" }).fill("Eric Clapton");
  await expect(page.locator(".directory-list li")).toHaveCount(1);
  await page.locator(".directory-list a").click();
  await expect(page.locator(".detail-heading h2")).toHaveText("Eric Clapton");
});
