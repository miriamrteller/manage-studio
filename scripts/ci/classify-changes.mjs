#!/usr/bin/env node
/**
 * Which CI suites a change needs. A suite is skipped only when EVERY changed
 * file is on that suite's skip list; anything else (an unknown file, the
 * lockfile, a workflow, this script) runs it. No file list at all (a manual
 * run, a new branch, a failed diff) runs everything.
 *
 *   web    lint, test, build (+ wrangler dry-run)
 *   edge   Edge Functions type-check, lint, Deno tests
 *   a11y   Playwright accessibility (only when visible UI changed)
 *   db     SQL suites, definer drift, local Supabase stack
 *
 * Usage: node scripts/ci/classify-changes.mjs <file-with-one-path-per-line>
 * Prints web=true|false etc., ready for $GITHUB_OUTPUT.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Changes that touch the pipeline itself always run every suite. */
const PIPELINE = [
  '.github/workflows/ci.yml',
  'scripts/ci/classify-changes.mjs',
  'scripts/ci/tested-tree.mjs',
];

/** Notes nobody imports. docs/legal is bundled into the web app, so it is code. */
function isDocs(f) {
  if (f.startsWith('docs/legal/')) return false;
  if (f.startsWith('docs/')) return true;
  return /^[^/]+\.md$/.test(f); // README.md, CLAUDE.md at the repo root
}

/** The marketing site has its own workflow (marketing-ci). */
const isMarketing = (f) => f.startsWith('apps/marketing/');

/** Same visible-UI paths the accessibility job used before, minus the demo layer. */
function isUi(f) {
  if (f.startsWith('apps/web/src/demo/')) return false;
  if (f.startsWith('apps/web/e2e/')) return true;
  if (!f.startsWith('apps/web/src/')) return false;
  return (
    /^apps\/web\/src\/(components|features|layouts|pages)\//.test(f) ||
    f.endsWith('.tsx') ||
    f.endsWith('.css')
  );
}

/** Same paths db-ci used (its own workflow file is now ci.yml, a pipeline file). */
function isDb(f) {
  return (
    f.startsWith('supabase/') ||
    f === 'packages/shared/src/database.types.ts' ||
    f.startsWith('scripts/ci/') ||
    f === 'scripts/gen-database-types.mjs'
  );
}

export function classify(files) {
  const list = files.map((f) => f.trim()).filter(Boolean);
  if (list.length === 0 || list.some((f) => PIPELINE.includes(f))) {
    return { web: true, edge: true, a11y: true, db: true };
  }
  // Web tests read supabase/migrations and supabase/functions, so only docs and marketing skip.
  const web = !list.every((f) => isDocs(f) || isMarketing(f));
  // Edge Functions import nothing outside supabase/ (packages/** still runs them, to be safe).
  const edge = !list.every((f) => isDocs(f) || isMarketing(f) || f.startsWith('apps/web/'));
  const a11y = web && list.some(isUi);
  const db = list.some(isDb);
  return { web, edge, a11y, db };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const path = process.argv[2];
  let files = [];
  try {
    files = path ? readFileSync(path, 'utf8').split('\n') : [];
  } catch {
    files = [];
  }
  for (const [k, v] of Object.entries(classify(files))) console.log(`${k}=${v}`);
}
