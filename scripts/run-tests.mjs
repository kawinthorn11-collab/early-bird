// npm test — runs tests/*.test.ts through Vite's SSR loader so import.meta.glob/JSON/TS work like in the app.
import { createServer } from 'vite';
import { readdirSync } from 'node:fs';
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', plugins: [] });
let failed = 0;
for (const f of readdirSync('tests').filter((x) => x.endsWith('.test.ts'))) {
  try { await vite.ssrLoadModule(`/tests/${f}`); } catch (e) { failed++; console.error(`✗ ${f}\n`, e); }
}
await vite.close();
process.exit(failed ? 1 : 0);
