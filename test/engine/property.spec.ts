import { test, expect } from '@playwright/test';
import { loadFixture } from './helpers';

/**
 * The headline guarantee: on every fixture page, every element in <body> gets an XPath that
 * matches it and only it, and no XPath is absolute. The rung histogram is printed so a change
 * that pushes picks toward Fragile shows up in review.
 */
for (const name of ['pokedex.html', 'login.html', 'shop.html']) {
  test(`every element in ${name} gets a unique relative XPath`, async ({ page }) => {
    await loadFixture(page, name);
    const report = await page.evaluate(() => {
      // @ts-expect-error injected global
      const { generateLocator, isUniqueMatch } = window.SGEngine;
      const failures: string[] = [];
      const rungs: Record<number, number> = {};
      const all = Array.from(document.body.querySelectorAll('*')).filter((el) => el.localName !== 'script');
      for (const el of all) {
        const r = generateLocator(el);
        rungs[r.rung] = (rungs[r.rung] ?? 0) + 1;
        if (!isUniqueMatch(r.xpath, el)) failures.push(`not unique: ${r.xpath}`);
        if (r.xpath.startsWith('/html') || r.xpath.startsWith('/body')) failures.push(`absolute: ${r.xpath}`);
      }
      return { total: all.length, failures, rungs };
    });
    console.log(`${name}: ${report.total} elements, by rung ${JSON.stringify(report.rungs)}`);
    expect(report.failures).toEqual([]);
    expect(report.total).toBeGreaterThan(10);
  });
}
