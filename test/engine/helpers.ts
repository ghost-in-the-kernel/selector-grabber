import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/** The engine bundled as a plain script that exposes window.SGEngine. */
export const engineBundle: string = (() => {
  const out = buildSync({
    entryPoints: [join(process.cwd(), 'src/engine/index.ts')],
    bundle: true,
    format: 'iife',
    globalName: 'SGEngine',
    write: false,
    target: 'chrome127',
  });
  return out.outputFiles[0].text;
})();

export function fixture(name: string): string {
  return readFileSync(join(process.cwd(), 'test/fixtures', name), 'utf8');
}

/** Load a fixture page and inject the engine into it. */
export async function loadFixture(page: Page, name: string): Promise<void> {
  await page.setContent(fixture(name));
  await page.addScriptTag({ content: engineBundle });
}

export interface Located {
  xpath: string;
  rung: number;
  stability: string;
  strategy: string;
  description: string;
}

/** Run the engine on the first element matching a CSS selector. */
export async function locate(page: Page, css: string): Promise<Located> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`fixture has no element for ${sel}`);
    // @ts-expect-error injected global
    return window.SGEngine.generateLocator(el);
  }, css);
}
