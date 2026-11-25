import { expect, test } from "@playwright/test";

test("published map and search remain usable when the database fails", async ({ page }) => {
  let databaseRequests = 0;
  await page.route("https://fallback.example/**", (route) => {
    databaseRequests += 1;
    return route.abort("failed");
  });

  await page.goto("/");
  await expect(page.locator(".graph-map canvas")).toBeVisible();
  await expect(page.locator(".map-status")).toContainText("Published snapshot (database unavailable)", { timeout: 25_000 });
  expect(databaseRequests).toBeGreaterThan(0);

  const requestsAfterFallback = databaseRequests;
  await page.getByRole("searchbox", { name: "Search the entire map" }).fill("Eric Clapton");
  await page.locator(".search-results button").filter({ hasText: "Eric Clapton" }).first().click();
  await expect(page.locator(".detail-heading h2")).toHaveText("Eric Clapton");
  await expect(page.locator(".connection-item").first()).toBeVisible();
  expect(databaseRequests).toBe(requestsAfterFallback);
});

test("a later search failure switches the whole map to the published snapshot", async ({ page }) => {
  let searchRequests = 0;
  await page.route("https://fallback.example/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/entities") && url.searchParams.has("search_text")) {
      searchRequests += 1;
      return route.abort("failed");
    }
    const rows = url.pathname.endsWith("/entities") ? [{
      id: "eric-clapton",
      label: "Eric Clapton",
      node_type: "guitarist",
      roles: ["guitarist"],
      summary: "Live test record",
      metadata: [],
      aliases: [],
      map_x: 0,
      map_y: 0,
      map_zone: "rock-circuit",
      starter: true,
      sources: [],
    }] : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });

  await page.goto("/");
  await expect(page.locator(".map-status")).toContainText("1 nodes");
  await expect(page.locator(".map-status")).toContainText("Live database");

  await page.getByRole("searchbox", { name: "Search the entire map" }).fill("Dream Theater");
  await expect.poll(() => searchRequests).toBeGreaterThan(0);
  await expect(page.locator(".map-status")).toContainText("Published snapshot (database unavailable)", { timeout: 25_000 });
  await expect(page.locator(".map-status")).not.toContainText("1 nodes");
  await expect(page.locator(".search-results button").filter({ hasText: "Dream Theater" }).first()).toBeVisible();
});
