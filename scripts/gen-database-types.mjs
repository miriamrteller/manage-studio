#!/usr/bin/env node
/**
 * Generate Supabase TypeScript types without shell redirect (Windows + Bun CLI safe).
 *
 * Usage:
 *   node scripts/gen-database-types.mjs           # --linked (hosted dev)
 *   node scripts/gen-database-types.mjs --local   # local Supabase
 *   node scripts/gen-database-types.mjs --all     # also copy to email-dist
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const useLocal = args.includes('--local');
const withEmailDist = args.includes('--all');

const outPath = join(root, 'packages/shared/src/database.types.ts');
const emailDistPath = join(
  root,
  'supabase/functions/_shared/email-dist/database.types.d.ts',
);

const supabaseArgs = ['exec', 'supabase', 'gen', 'types', 'typescript'];
supabaseArgs.push(useLocal ? '--local' : '--linked');

console.log(
  `Generating database types (${useLocal ? 'local' : 'linked'} — often ~30s)...`,
);

const result = spawnSync('pnpm', supabaseArgs, {
  cwd: root,
  encoding: 'buffer',
  maxBuffer: 64 * 1024 * 1024,
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`Failed to run Supabase CLI: ${result.error.message}`);
  console.error(
    'Tip: run from an external terminal if the IDE integrated terminal crashes.',
  );
  process.exit(1);
}

if (result.status !== 0) {
  if (result.stderr?.length) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.status ?? 1);
}

const content = result.stdout.toString('utf8').replace(/^\uFEFF/, '');
if (!content.includes('export type Database')) {
  console.error('supabase gen types did not produce expected output.');
  if (result.stderr?.length) {
    process.stderr.write(result.stderr);
  }
  process.exit(1);
}

const previous = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null;
if (content !== previous) {
  writeFileSync(outPath, content, 'utf8');
  console.log(`Wrote ${outPath}`);
} else {
  console.log(`Unchanged ${outPath}`);
}

if (withEmailDist) {
  copyFileSync(outPath, emailDistPath);
  console.log(`Copied ${outPath} -> ${emailDistPath}`);
}
