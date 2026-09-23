const { test, expect } = require("@playwright/test");
const { preparePage } = require("./helpers");

const mapPattern = "https://mapmyvisitors.com/map.png?*";
const mapFixture =
  '<svg xmlns="http://www.w3.org/2000/svg" width="347" height="195"><rect width="347" height="195" fill="white"/><path d="M25 65h90v55H70v25H40zM155 50h150v65h-90v45h-50z" fill="#d1d1d1"/><circle cx="83" cy="94" r="3" fill="#500000"/></svg>';
const homePath = process.env.SITE_URL ? new URL(process.env.SITE_URL).pathname : "/al-folio/";

test.beforeEach(async ({ page }, testInfo) => {
  await page.setViewportSize(testInfo.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 800 });
  await preparePage(page, "dark");
  // Keep the existing development server's live reload from interrupting assertions.
  await page.route(/\/livereload\.js(?:\?|$)/, (route) => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.emulateMedia({ colorScheme: "dark" });
});

test("site remains light and offers no theme settings", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(mapPattern, (route) => route.fulfill({ contentType: "image/svg+xml", body: mapFixture }));
  await page.goto(homePath);
  await expect(page.locator("#light-toggle")).toHaveCount(0);
  await expect(page.locator('script[src*="/theme.js"], #highlight_theme_dark')).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator("#navbar .nav-item.active > a")).toHaveCSS("color", "rgb(80, 0, 0)");
  await expect(page.locator("#experience .timeline-title a").first()).toHaveCSS("color", "rgb(80, 0, 0)");

  const navigationToggle = page.getByRole("button", { name: "Toggle navigation" });
  if (await navigationToggle.isVisible()) await navigationToggle.click();
  await page.getByRole("button", { name: "Open search" }).click();
  await expect(page.getByRole("textbox", { name: "Type to start searching" })).toBeVisible();
  for (const title of ["Change theme to light", "Change theme to dark", "Use system default theme"]) {
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("portrait, real content, and footer fit desktop and mobile", async ({ page }, testInfo) => {
  await page.route(mapPattern, (route) => route.fulfill({ contentType: "image/svg+xml", body: mapFixture }));
  await page.goto(homePath);
  const portrait = page.getByRole("img", { name: "Ailimulati Yusupu", exact: true });
  await expect(portrait).toBeVisible();
  await expect.poll(() => portrait.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.locator("#experience .timeline-entry")).toHaveCount(3);
  await expect(page.locator("#education .timeline-entry")).toHaveCount(3);
  await expect(page.locator("#news, .latest-posts")).toHaveCount(0);
  await expect(page.locator("#publications ol.bibliography > li")).toHaveCount(1);
  await expect(page.locator("#publications")).toContainText("Medical QA dialogue datasets");
  const contacts = page.getByRole("navigation", { name: "Contact and profiles" });
  await expect(contacts.getByRole("link")).toHaveCount(4);
  await expect(contacts.getByRole("link", { name: "Email", exact: true })).toHaveAttribute("href", "mailto:alimuratysp@gmail.com");
  await expect(contacts.getByRole("link", { name: "LinkedIn", exact: true })).toHaveAttribute(
    "href",
    "https://www.linkedin.com/in/ailimulati-yusupu-637171358"
  );
  await expect(contacts.getByRole("link", { name: "Google Scholar", exact: true })).toHaveAttribute(
    "href",
    /scholar\.google\.com\/citations\?user=ZCXZldkAAAAJ/
  );
  const cv = contacts.getByRole("link", { name: "CV (PDF)", exact: true });
  await expect(cv).toHaveAttribute("href", `${homePath}assets/pdf/Alimurat_CV.pdf`);
  await expect(cv).toHaveCSS("color", "rgb(80, 0, 0)");
  for (const icon of await contacts.locator("i").all()) {
    await expect(icon).toHaveCSS("color", "rgb(80, 0, 0)");
    expect(await icon.evaluate((el) => getComputedStyle(el, "::before").color)).toBe("rgb(80, 0, 0)");
  }
  const cvResponse = await page.request.get(await cv.getAttribute("href"));
  expect(cvResponse.ok()).toBe(true);
  expect((await cvResponse.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await expect(page.locator(".homepage")).not.toContainText(/Einstein|555 your office|Affiliations|you@example.com/);

  const imageBox = await portrait.boundingBox();
  const biographyBox = await page.locator(".home-biography").boundingBox();
  expect(imageBox.width).toBeCloseTo(imageBox.height, 0);
  await expect(portrait).toHaveCSS("border-radius", /^(50%|9999px)$/);
  if (testInfo.project.name === "mobile") {
    expect(imageBox.width).toBeLessThanOrEqual(150);
  } else {
    expect(imageBox.width).toBeLessThanOrEqual(170);
    expect(imageBox.x + imageBox.width).toBeCloseTo(biographyBox.x + biographyBox.width, -1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const footer = page.getByRole("contentinfo");
  await expect(footer).toHaveText(/Last updated by Ailimulati, [A-Z][a-z]{2} \d{4}\. Template modified from\s+al-folio\./);
  await expect(footer.getByRole("link", { name: "al-folio" })).toHaveAttribute("href", "https://github.com/alshedivat/al-folio");
  await expect(footer).toHaveCSS("position", "static");
  await expect(footer).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(footer).not.toBeInViewport();
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeInViewport();
  const mapBox = await page.locator("#visitor-map-section").boundingBox();
  expect((await footer.boundingBox()).y).toBeGreaterThanOrEqual(mapBox.y + mapBox.height);
  await page.screenshot({ path: testInfo.outputPath("homepage.png"), fullPage: true });
});

for (const outcome of ["loaded", "failed"]) {
  test(`visitor map reserves space while delayed and ${outcome}`, async ({ page }) => {
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.route(mapPattern, async (route) => {
      await pending;
      if (outcome === "failed") await route.abort();
      else await route.fulfill({ contentType: "image/svg+xml", body: mapFixture });
    });
    await page.goto(homePath, { waitUntil: "domcontentloaded" });
    const map = page.locator("#visitor-map-section");
    await expect(map).toHaveCSS("max-width", "220px");
    // WebKit keeps document.fonts.ready pending until the delayed image finishes.
    // Load text fonts explicitly so unrelated font swaps cannot move the footer.
    await page.evaluate(() => Promise.all([300, 400, 500, 700].map((weight) => document.fonts.load(`${weight} 16px Roboto`))));
    const before = await map.boundingBox();
    const footerBefore = await page.getByRole("contentinfo").boundingBox();
    expect(before.width).toBeLessThanOrEqual(220);
    expect(before.height).toBeCloseTo((before.width * 195) / 347, 1);
    release();
    if (outcome === "failed") {
      await expect(page.getByText("Visitor map is temporarily unavailable.")).toBeVisible();
      await expect(map.locator("img")).toBeHidden();
    } else {
      await expect.poll(() => map.locator("img").evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    }
    expect(await map.boundingBox()).toEqual(before);
    expect((await page.getByRole("contentinfo").boundingBox()).y).toBeCloseTo(footerBefore.y, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(requests.some((url) => url.includes("mapmyvisitors.com/map.js"))).toBe(false);
    await expect(page.locator("#mapmyvisitors-widget, .jvectormap-container")).toHaveCount(0);
  });
}

test("code diffs keep light highlighting with dark OS preference", async ({ page }) => {
  await page.goto(`${homePath}blog/2024/code-diff/`);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  await expect(page.locator('link[media*="prefers-color-scheme: dark"], link[href*="github-dark"]')).toHaveCount(0);
  await expect(page.locator('link[href*="highlight.js"][href*="github.min.css"]')).toHaveAttribute("media", "screen");
});
