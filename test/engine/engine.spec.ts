import { test, expect } from '@playwright/test';
import { engineBundle, loadFixture, locate } from './helpers';

test.describe('pokedex fixture', () => {
  test.beforeEach(async ({ page }) => loadFixture(page, 'pokedex.html'));

  test('table by stable id', async ({ page }) => {
    const r = await locate(page, 'table#pokedex');
    expect(r.xpath).toBe("//table[@id='pokedex']");
    expect(r.stability).toBe('Strong');
  });

  test('link by its visible text', async ({ page }) => {
    const r = await locate(page, 'a[href="/pokedex/bulbasaur"]');
    expect(r.xpath).toBe("//a[normalize-space()='Bulbasaur']");
    expect(r.description).toBe('link "Bulbasaur"');
  });

  test('stat cell through its row, identified by the name link', async ({ page }) => {
    // Bulbasaur's HP (45) appears in several rows, so the row must be found first.
    const r = await locate(page, 'tbody tr:nth-child(1) td:nth-child(5)');
    expect(r.xpath).toBe("//table[@id='pokedex']//tr[td/a[normalize-space()='Bulbasaur']]/td[5]");
    expect(r.rung).toBe(7);
  });

  test('duplicate link text resolved by a nearby unique label', async ({ page }) => {
    // Three rows link to "Charizard"; the Mega X row is told apart by its <small> label.
    const r = await locate(page, 'tbody tr:nth-child(7) td.cell-name a');
    expect(r.xpath).toBe("//table[@id='pokedex']//td[small[normalize-space()='Mega Charizard X']]//a[normalize-space()='Charizard']");
  });

  test('search box by aria-label', async ({ page }) => {
    const r = await locate(page, 'input[type=search]');
    expect(r.xpath).toBe("//input[@aria-label='Filter Pokémon']");
  });
});

test.describe('login fixture', () => {
  test.beforeEach(async ({ page }) => loadFixture(page, 'login.html'));

  test('field with a generated id is found through its label', async ({ page }) => {
    const r = await locate(page, 'input[type=email]');
    expect(r.xpath).toBe("//input[@id=//label[normalize-space()='Email']/@for]");
    expect(r.xpath).not.toContain(':r1:');
  });

  test('checkbox inside its label', async ({ page }) => {
    const r = await locate(page, 'input[type=checkbox]');
    expect(r.xpath).toBe("//input[ancestor::label[normalize-space()='Remember me']]");
  });

  test('test attribute wins over text', async ({ page }) => {
    const r = await locate(page, 'button[type=submit]');
    expect(r.xpath).toBe("//button[@data-testid='login-submit']");
    expect(r.rung).toBe(1);
  });

  test('text with both quote types uses concat()', async ({ page }) => {
    const r = await locate(page, 'p.notice');
    expect(r.xpath).toBe(`//p[normalize-space()=concat('It', "'", 's "new": passwordless sign-in')]`);
  });

  test('select by name', async ({ page }) => {
    const r = await locate(page, 'select');
    expect(r.xpath).toBe("//select[@name='region']");
  });
});

test.describe('shop fixture', () => {
  test.beforeEach(async ({ page }) => loadFixture(page, 'shop.html'));

  test('identical buttons told apart by their card title', async ({ page }) => {
    const r = await locate(page, '#product-card-4822 button');
    expect(r.xpath).toBe("//div[@id='root']//div[h3[normalize-space()='Red mug']]//button[normalize-space()='Add to cart']");
    expect(r.xpath).not.toContain('4822');
  });

  test('SVG path uses local-name() under its labelled button', async ({ page }) => {
    const r = await locate(page, 'button[aria-label="Open menu"] path');
    expect(r.xpath).toBe("//button[@aria-label='Open menu']//*[local-name()='path']");
  });

  test('hashed classes and counter ids are never used', async ({ page }) => {
    const r = await locate(page, 'a[href="/cart"]');
    expect(r.xpath).toBe("//a[normalize-space()='Cart']");
  });

  test('random per-load ids (Google style) are skipped in favour of text', async ({ page }) => {
    const r = await locate(page, 'h3[id^="_x"]');
    expect(r.xpath).toBe("//h3[normalize-space()='Example: Homepage']");
  });

  test('long result titles match on their opening words, not their position', async ({ page }) => {
    const r = await locate(page, 'h3#_xCu5avrzHvXL0PEPy7fBkQY_76');
    expect(r.xpath).toBe("//h3[starts-with(normalize-space(),'The future is yours to build | Example')]");
    expect(r.xpath).not.toMatch(/\)\[\d+\]$/);
  });

  test('repeated items are reached from a named list, within three steps', async ({ page }) => {
    const r = await locate(page, 'ul li:nth-child(2) span');
    expect(r.xpath).toBe("//div[@id='root']//ul[li/span[normalize-space()='Free shipping']]/li[2]/span");
  });
});

test.describe('github-style form fixture', () => {
  test.beforeEach(async ({ page }) => loadFixture(page, 'github-form.html'));

  test('React 19 ids (_r_c_) are skipped; the label is used', async ({ page }) => {
    const r = await locate(page, 'input#_r_c_');
    expect(r.xpath).toBe("//input[@id=//label[normalize-space()='Description']/@for]");
    expect(r.stability).toBe('Strong');
  });

  test('text shared with a wrapper is matched on the element\'s own text', async ({ page }) => {
    const r = await locate(page, 'button#_r_5_ span > span:nth-child(2)');
    expect(r.xpath).toBe("//span[normalize-space(text())='ghost-in-the-kernel']");
  });

  test('a container is named by its legend, not reached from the page top', async ({ page }) => {
    const r = await locate(page, 'fieldset > div');
    expect(r.xpath).toBe("//fieldset[legend[normalize-space()='Repository owner and name']]/div");
  });

  test('display text keeps words from separate blocks apart', async ({ page }) => {
    const r = await locate(page, 'fieldset > div');
    expect(r.description).toContain('Owner (required)* ghost-in-the-kernel');
  });
});

test('nothing to go on anywhere: position under the nearest anchor, labelled Fragile', async ({ page }) => {
  await page.setContent('<main id="app"><div><i></i><i></i></div><div><i></i></div></main>');
  await page.addScriptTag({ content: engineBundle });
  const r = await locate(page, 'div:first-child i:nth-child(2)');
  expect(r.xpath).toBe("(//main[@id='app']//i)[2]");
  expect(r.stability).toBe('Fragile');
});
