/** Not an assertion suite: captures README screenshots. Run with SHOTS=1. */
import { test, chromium, type Frame } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

test.skip(!process.env.SHOTS, 'set SHOTS=1 to capture screenshots');

test('capture screenshots', async () => {
  const EXT = join(process.cwd(), 'dist-e2e');
  const server = createServer((req, res) => {
    try {
      const body = readFileSync(join(process.cwd(), 'test/fixtures', (req.url ?? '').slice(1)));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  mkdirSync('docs', { recursive: true });
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 760 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/pokedex.html`);
  await sw.evaluate(async () => {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await (self as unknown as { sgActivate(t: chrome.tabs.Tab): Promise<void> }).sgActivate(t);
  });
  await page.waitForTimeout(300);
  await page.click('a[href="/pokedex/bulbasaur"]');
  await page.click('tbody tr:nth-child(1) td:nth-child(5)');
  await page.click('table#pokedex', { position: { x: 5, y: 5 } });
  await page.hover('tbody tr:nth-child(4) td.cell-name a');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'docs/picking.png' });
  await page.keyboard.press('Enter');
  let panel: Frame | undefined;
  for (let i = 0; i < 50 && !panel; i++) {
    panel = page.frames().find((f) => f.url().includes('panel.html'));
    await page.waitForTimeout(100);
  }
  await panel!.waitForSelector('.card');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/results.png' });
  await ctx.close();
  server.close();
});
