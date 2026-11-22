import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { storageState, type SeededRole } from "../support/accounts.js";
import { open } from "../support/ui.js";

// WCAG AA colour contrast (axe's color-contrast rule: 4.5:1 for text, 3:1 for large text) on the
// main page of each role, on desktop. The page is checked once its data has loaded.
const PAGES: { role: SeededRole; url: string; name: string }[] = [
  { role: "restaurant", url: "/dashboard", name: "restaurant home" },
  { role: "restaurant", url: "/search", name: "search" },
  { role: "store", url: "/dashboard", name: "store home" },
  { role: "store", url: "/my-profile", name: "store profile" },
  { role: "restaurant", url: "/my-profile", name: "restaurant profile" },
  { role: "store", url: "/my-products", name: "store products" },
  { role: "store", url: "/orders", name: "store orders" },
  { role: "admin", url: "/admin", name: "admin overview" },
];

const checkContrast = async (page: Page) => {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  // Every failing element with its colours and ratio, so a failure says what to fix.
  const failures = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${node.target.join(" ")}: ${node.failureSummary?.replace(/\s+/g, " ")}`),
  );
  expect(failures).toEqual([]);
  // Checked elements (passes) and the ones axe could not decide (e.g. text over an image).
  return { passes: results.passes.flatMap((rule) => rule.nodes).length, incomplete: results.incomplete.flatMap((rule) => rule.nodes).length };
};

for (const { role, url, name } of PAGES) {
  test.describe(() => {
    test.use({ storageState: storageState(role) });
    test.skip(({ isMobile }) => isMobile, "Checked on desktop");

    test(`the ${name} page meets WCAG AA colour contrast`, async ({ page }, testInfo) => {
      await open(page, url);
      await expect(page.getByRole("main").getByRole("heading", { level: 1 }).first()).toBeVisible();
      // Wait for the requests to finish and the spinners and placeholders to go.
      await page.waitForLoadState("networkidle");
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      const counts = await checkContrast(page);
      testInfo.annotations.push({ type: "axe color-contrast", description: `${counts.passes} passed, ${counts.incomplete} to review` });
    });
  });
}
