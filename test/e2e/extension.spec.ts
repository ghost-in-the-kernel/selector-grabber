/**
 * End-to-end: the built extension (dist-e2e/) loaded into real Chromium.
 * Run with `npm run test:e2e`, which builds dist-e2e first.
 *
 * Tests cannot click the browser toolbar, so they call the same activate() function the
 * toolbar click calls, from inside the service worker. That is why the E2E build adds a host
 * permission the shipped build does not need.
 */
import { test as base, expect, chromium, type BrowserContext, type Frame, type Page, type Worker } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const EXT = join(process.cwd(), 'dist-e2e');

const test = base.extend<{ context: BrowserContext; sw: Worker; site: string }>({
  // eslint-disable-next-line no-empty-pattern
  site: async ({}, use) => {
    const server: Server = createServer((req, res) => {
      const name = (req.url ?? '/').replace(/^\//, '').split('?')[0] || 'pokedex.html';
      try {
        const body = readFileSync(join(process.cwd(), 'test/fixtures', name));
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as { port: number };
    await use(`http://127.0.0.1:${port}`);
    server.close();
  },
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      // plain-http.example resolves to the local server: a non-secure origin, like most intranet test sites.
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--host-resolver-rules=MAP plain-http.example 127.0.0.1', '--no-proxy-server'],
    });
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(sw);
  },
});

async function activate(sw: Worker): Promise<void> {
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    // @ts-expect-error exposed by background.ts for tests
    await self.sgActivate(tab);
  });
}

async function panelFrame(page: Page): Promise<Frame> {
  let frame: Frame | undefined;
  await expect.poll(() => (frame = page.frames().find((f) => f.url().includes('/panel/panel.html')))).toBeTruthy();
  await frame!.waitForSelector('.card');
  return frame!;
}

/**
 * Playwright cannot compute mouse coordinates for an iframe whose owner element sits in a closed
 * shadow root (the panel's case), so tests drive the panel by keyboard: focus a control, press a key.
 * Keyboard input is trusted user activation, exactly like a real click.
 */
async function press(page: Page, panel: Frame, selector: string, key = 'Enter'): Promise<void> {
  await panel.focus(selector);
  await page.keyboard.press(key);
}

const overlayPresent = (page: Page) => page.evaluate(() => !!document.querySelector('selector-grabber-root'));

test('pick three elements, press Enter, get Playwright and Selenium Java', async ({ context, sw, site }) => {
  const page = await context.newPage();
  await page.goto(`${site}/pokedex.html`);
  await page.bringToFront();
  await activate(sw);
  await expect.poll(() => overlayPresent(page)).toBe(true);

  await page.click('a[href="/pokedex/bulbasaur"]');
  await page.click('tbody tr:nth-child(1) td:nth-child(5)');
  await page.click('h1');
  expect(page.url()).toBe(`${site}/pokedex.html`); // the link click was captured, not followed

  await page.keyboard.press('Enter');
  const panel = await panelFrame(page);

  await expect(panel.locator('#summary')).toHaveText('3 selectors · 127.0.0.1');
  await expect(panel.locator('.ordinal')).toHaveText(['1st selector', '2nd selector', '3rd selector']);
  await expect(panel.locator('pre')).toHaveText([
    `page.locator("xpath=//a[normalize-space()='Bulbasaur']");`,
    `page.locator("xpath=//table[@id='pokedex']//tr[.//a[normalize-space()='Bulbasaur']]/td[5]");`,
    `page.locator("xpath=//h1[normalize-space()='Pokémon Pokédex']");`,
  ]);

  await press(page, panel, '[data-framework="selenium"]');
  await expect(panel.locator('pre').first()).toHaveText(`driver.findElement(By.xpath("//a[normalize-space()='Bulbasaur']"));`);

  await press(page, panel, '[data-mode="raw"]');
  await expect(panel.locator('pre').nth(1)).toHaveText("//table[@id='pokedex']//tr[.//a[normalize-space()='Bulbasaur']]/td[5]");
});

test('Copy all puts the formatted list on the clipboard', async ({ context, sw, site }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  await page.goto(`${site}/login.html`);
  await page.bringToFront();
  await activate(sw);
  await expect.poll(() => overlayPresent(page)).toBe(true);
  await page.click('button[type=submit]');
  await page.click('input[type=email]');
  await page.keyboard.press('Enter');

  const panel = await panelFrame(page);
  await press(page, panel, '[data-framework="playwright"]');
  await press(page, panel, '[data-mode="code"]');
  await press(page, panel, '#copyAll');
  await expect(panel.locator('#copyAll')).toHaveText('Copied ✓');

  // The panel iframe may only write the clipboard, so read it back from the top-level page.
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  {
    expect(clip).toBe(
      [
        `// 1st selector: button "Sign in"  [Strong]`,
        `page.locator("xpath=//button[@data-testid='login-submit']");`,
        `// 2nd selector: textbox "Email"  [Strong]`,
        `page.locator("xpath=//input[@id=//label[normalize-space()='Email']/@for]");`,
      ].join('\n'),
    );
  }
});

test('Esc cancels, and clicking a picked element again unpicks it', async ({ context, sw, site }) => {
  const page = await context.newPage();
  await page.goto(`${site}/shop.html`);
  await page.bringToFront();
  await activate(sw);
  await expect.poll(() => overlayPresent(page)).toBe(true);

  await page.click('#product-card-4822 button');
  await page.click('#product-card-4822 button'); // unpick
  await page.click('#product-card-4823 button');
  await page.keyboard.press('Enter');
  const panel = await panelFrame(page);
  await expect(panel.locator('.card')).toHaveCount(1);
  await expect(panel.locator('pre')).toHaveText(
    `page.locator("xpath=//div[@id='root']//div[.//h3[normalize-space()='Green mug']]/button");`,
  );

  // Key-down alone: it closes the panel, and Playwright would otherwise wait forever to deliver
  // the key-up to the iframe that no longer exists.
  await panel.focus('#close');
  await page.keyboard.down('Escape');
  await expect.poll(() => overlayPresent(page)).toBe(false);
  await page.keyboard.up('Escape');
});

test('clicking the icon again turns the picker off', async ({ context, sw, site }) => {
  const page = await context.newPage();
  await page.goto(`${site}/pokedex.html`);
  await page.bringToFront();
  await activate(sw);
  await expect.poll(() => overlayPresent(page)).toBe(true);
  await activate(sw);
  await expect.poll(() => overlayPresent(page)).toBe(false);
  // Page clicks work normally again.
  await page.click('a[href="/pokedex/bulbasaur"]');
  await expect(page).toHaveURL(`${site}/pokedex/bulbasaur`);
});

test('works on plain-http (non-secure) sites', async ({ context, sw, site }) => {
  const page = await context.newPage();
  await page.goto(site.replace('127.0.0.1', 'plain-http.example') + '/pokedex.html');
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  await page.bringToFront();
  await activate(sw);
  await expect.poll(() => overlayPresent(page)).toBe(true);
  await page.click('table#pokedex', { position: { x: 5, y: 5 } });
  await page.keyboard.press('Enter');
  const panel = await panelFrame(page);
  await expect(panel.locator('.card')).toHaveCount(1);
});
