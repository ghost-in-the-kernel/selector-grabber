// Builds the extension into dist/ (or dist-e2e/ with --e2e).
// Load the output folder in brave://extensions or chrome://extensions with "Load unpacked".
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const e2e = process.argv.includes('--e2e');
const out = e2e ? 'dist-e2e' : 'dist';

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/panel`, { recursive: true });

const common = {
  bundle: true,
  target: 'chrome127',
  logLevel: 'info',
  legalComments: 'none',
};

await build({ ...common, entryPoints: ['src/background.ts'], outfile: `${out}/background.js`, format: 'esm' });
await build({ ...common, entryPoints: ['src/picker/picker.ts'], outfile: `${out}/picker.js`, format: 'iife' });
await build({ ...common, entryPoints: ['src/panel/panel.ts'], outfile: `${out}/panel/panel.js`, format: 'iife' });
await build({ ...common, entryPoints: ['src/blocked/blocked.ts'], outfile: `${out}/blocked.js`, format: 'iife' });

cpSync('src/blocked/blocked.html', `${out}/blocked.html`);
cpSync('src/panel/panel.html', `${out}/panel/panel.html`);
cpSync('src/panel/panel.css', `${out}/panel/panel.css`);
cpSync('static/icons', `${out}/icons`, { recursive: true });

const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
if (e2e) {
  // Automated tests cannot click the toolbar icon, so activeTab is never granted.
  // The test build adds a host permission instead. Never ship this build.
  manifest.host_permissions = ['<all_urls>'];
  manifest.name += ' (E2E test build)';
}
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));

console.log(`\nBuilt ${manifest.name} ${manifest.version} into ${out}/`);
