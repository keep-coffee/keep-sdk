/* Test runner — executes every structural test (no network) and reports.
 * Excludes read-mainnet.mjs (live RPC; run via `npm run test:live`).
 * Run: node test/run.mjs */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const skip = new Set(['run.mjs', 'read-mainnet.mjs', 'live-verify.mjs']);
const tests = readdirSync(dir).filter((f) => f.endsWith('.mjs') && !skip.has(f)).sort();

let failed = 0;
for (const t of tests) {
  const r = spawnSync(process.execPath, [join(dir, t)], { encoding: 'utf8' });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${t}`);
  if (!ok) console.log((r.stdout || '') + (r.stderr || ''));
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
