/**
 * Not an assertion suite: captures the README and Chrome Web Store images from the real
 * extension on a fictional demo page. Run with:  npm run build:e2e && SHOTS=1 npx playwright test -g capture
 * Output: docs/store/*.png (1280x800 screenshots, 440x280 promo tile; 24-bit, no alpha).
 */
import { test, chromium, type Frame, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test.skip(!process.env.SHOTS, 'set SHOTS=1 to capture screenshots');

const OUT = 'docs/store';

async function press(page: Page, frame: Frame, selector: string): Promise<void> {
  await frame.focus(selector);
  await page.keyboard.press('Enter');
}

test('capture store screenshots', async () => {
  test.setTimeout(60_000);
  const EXT = join(process.cwd(), 'dist-e2e');
  const server = createServer((_req, res) => {
    try {
      const body = readFileSync(join(process.cwd(), 'docs/demo/store-demo.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  mkdirSync(OUT, { recursive: true });

  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--host-resolver-rules=MAP harborbooks.example 127.0.0.1', '--no-proxy-server'],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  const page = await ctx.newPage();
  await page.goto(`http://harborbooks.example:${port}/inventory`);
  await sw.evaluate(async () => {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await (self as unknown as { sgActivate(t: chrome.tabs.Tab): Promise<void> }).sgActivate(t);
  });
  await page.waitForTimeout(300);

  await page.click('input[type=search]');
  await page.click('[data-testid="add-book"]');
  await page.click('tbody tr:nth-child(2) .edit');
  await page.hover('tbody tr:nth-child(5) td:nth-child(5)');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/screenshot-1-picking.png` });

  await page.keyboard.press('Enter');
  let panel: Frame | undefined;
  for (let i = 0; i < 50 && !panel; i++) {
    panel = page.frames().find((f) => f.url().includes('panel.html'));
    await page.waitForTimeout(100);
  }
  await panel!.waitForSelector('.card');
  await press(page, panel!, '[data-framework="playwright"]');
  await press(page, panel!, '[data-mode="code"]');
  await panel!.focus('#copyAll');
  await page.mouse.move(5, 790);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/screenshot-2-playwright.png` });

  await press(page, panel!, '[data-framework="selenium"]');
  await panel!.focus('#copyAll');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/screenshot-3-selenium.png` });
  await press(page, panel!, '[data-framework="playwright"]'); // leave the saved preference at the default

  // Promo tile, 440x280.
  const tile = await ctx.newPage();
  await tile.setViewportSize({ width: 440, height: 280 });
  const icon = readFileSync(join(process.cwd(), 'static/icons/icon128.png')).toString('base64');
  await tile.setContent(`<!doctype html><html><body style="margin:0;width:440px;height:280px;background:linear-gradient(135deg,#1e3a8a,#2563eb);font-family:system-ui,sans-serif;color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 32px;box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:14px">
      <img src="data:image/png;base64,${icon}" width="64" height="64" style="border-radius:14px">
      <div style="font-size:30px;font-weight:800;letter-spacing:.2px">Selector Grabber</div>
    </div>
    <div style="font-size:17px;margin-top:14px;color:#dbeafe;line-height:1.35">Click elements. Copy unique XPath<br>for Playwright and Selenium.</div>
    <div style="margin-top:16px;font:13px ui-monospace,Menlo,Consolas,monospace;background:rgba(15,23,42,.55);padding:8px 10px;border-radius:8px;white-space:nowrap;overflow:hidden">//tr[td/a[normalize-space()='Quiet Engines']]</div>
  </body></html>`);
  await tile.screenshot({ path: `${OUT}/promo-small-440x280.png` });

  await ctx.close();
  server.close();

  // The store wants 24-bit images with no alpha channel.
  execFileSync('python3', ['-c', `
from PIL import Image
import glob
for p in glob.glob('${OUT}/*.png'):
    Image.open(p).convert('RGB').save(p)
`]);
});
