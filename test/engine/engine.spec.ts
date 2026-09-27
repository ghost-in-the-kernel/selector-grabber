import { test, expect } from '@playwright/test';
import { loadFixture, locate } from './helpers';

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
    expect(r.xpath).toBe("//table[@id='pokedex']//tr[.//a[normalize-space()='Bulbasaur']]/td[5]");
    expect(r.rung).toBe(7);
  });

  test('duplicate link text resolved by a nearby unique label', async ({ page }) => {
    // Three rows link to "Charizard"; the Mega X row is told apart by its <small> label.
    const r = await locate(page, 'tbody tr:nth-child(7) td.cell-name a');
    expect(r.xpath).toBe("//table[@id='pokedex']//td[.//small[normalize-space()='Mega Charizard X']]/a");
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
    expect(r.xpath).toBe("//div[@id='root']//div[.//h3[normalize-space()='Red mug']]/button");
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

  test('no distinguishing feature falls back to a labelled position', async ({ page }) => {
    const r = await locate(page, 'ul li:nth-child(2) span');
    expect(r.stability).toBe('Fragile');
    expect(r.xpath).toMatch(/^\(\/\/div\[@id='root'\]\/\/span\)\[\d+\]$/);
  });
});
