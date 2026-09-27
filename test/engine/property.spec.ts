import { test, expect } from '@playwright/test';
import { loadFixture } from './helpers';

/**
 * The headline guarantee: on every fixture page, every element in <body> gets an XPath that
 * matches it and only it, and no XPath is absolute. The rung histogram is printed so a change
 * that pushes picks toward Fragile shows up in review.
 */
for (const name of ['pokedex.html', 'login.html', 'shop.html', 'github-form.html']) {
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
        // No absolute path in disguise: never more than 3 single-slash steps in a row.
        const outside = r.xpath.replace(/'[^']*'|"[^"]*"/g, "''");
        let depth = 0, run = 0, longest = 0;
        for (let i = 0; i < outside.length; i++) {
          const ch = outside[i];
          if (ch === '[' || ch === '(') depth++;
          else if (ch === ']' || ch === ')') depth--;
          else if (ch === '/' && depth === 0) {
            if (outside[i + 1] === '/' || outside[i - 1] === '/') run = 0;
            else longest = Math.max(longest, ++run);
          }
        }
        if (longest > 3) failures.push(`${longest} child steps in a row: ${r.xpath}`);
      }
      return { total: all.length, failures, rungs };
    });
    console.log(`${name}: ${report.total} elements, by rung ${JSON.stringify(report.rungs)}`);
    expect(report.failures).toEqual([]);
    expect(report.total).toBeGreaterThan(10);
  });
}
