import { expect, test } from "@playwright/test";

async function visiblePixels(page: import("@playwright/test").Page, png: Buffer) {
  return page.evaluate(async (encoded) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const sample = document.createElement("canvas");
    sample.width = image.width;
    sample.height = image.height;
    const context = sample.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let visible = 0;
    for (let y = 0; y < image.height; y += 12) {
      for (let x = 0; x < image.width; x += 12) {
        const offset = (y * image.width + x) * 4;
        if (Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) > 40) visible += 1;
      }
    }
    return visible;
  }, png.toString("base64"));
}

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
});

test("globe preview unlocks, renders and responds to its main controls", async ({ page }) => {
  await page.goto("/globe.html");
  await expect(page.getByRole("heading", { name: "Globus" })).toBeVisible();
  await page.getByLabel("Passord").fill("ken");
  await page.getByRole("button", { name: "Åpne globus" }).click();

  const canvas = page.locator(".globe-scene canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).width)).toBeGreaterThan(0);
  await expect(await visiblePixels(page, await canvas.screenshot({ path: "test-results/globe-desktop.png" }))).toBeGreaterThan(40);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(await visiblePixels(page, await canvas.screenshot({ path: "test-results/globe-mobile.png" }))).toBeGreaterThan(20);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator(".globe-stage-count")).toContainText("nodes");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom out" }).click();

  const year = page.getByRole("slider", { name: "Show nodes started by year" });
  await expect(year).toBeDisabled();
  await page.locator(".globe-time-head input[type=checkbox]").check();
  await expect(year).toBeEnabled();
  await page.getByRole("textbox", { name: "Search all music history" }).fill("ABBA");
  await page.locator(".globe-search-results button").filter({ hasText: "ABBA" }).first().click();
  await expect(page.locator(".globe-detail h1")).toHaveText("ABBA");
});

test("playground loads both maps and completes an experiment", async ({ page }) => {
  await page.goto("/playground.html");
  await expect(page.locator(".lab-header-meta")).toContainText("nodes");
  await expect(page.locator(".lab-map-panel canvas")).toHaveCount(2);
  await page.getByRole("group", { name: "Base layout" }).getByRole("button", { name: "Genres" }).click();
  await expect(page.locator(".lab-panel-title").first()).toContainText("Genres");
  await page.locator(".lab-field select").selectOption("jazz");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".lab-outcome")).not.toHaveText("No trial", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Better" })).toBeEnabled();
});
