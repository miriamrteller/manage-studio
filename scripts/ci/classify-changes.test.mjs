import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './classify-changes.mjs';

const ALL = { web: true, edge: true, a11y: true, db: true };

test('no file list runs everything', () => {
  assert.deepEqual(classify([]), ALL);
  assert.deepEqual(classify(['', '  ']), ALL);
});

test('a pipeline change runs everything', () => {
  assert.deepEqual(classify(['.github/workflows/ci.yml']), ALL);
  assert.deepEqual(classify(['README.md', 'scripts/ci/classify-changes.mjs']), ALL);
  assert.deepEqual(classify(['scripts/ci/tested-tree.mjs']), ALL);
});

test('docs-only skips the code suites', () => {
  assert.deepEqual(classify(['docs/deployment/CUSTOM-DOMAIN.md', 'CLAUDE.md']), {
    web: false, edge: false, a11y: false, db: false,
  });
});

test('docs/legal is app code: the web suites run', () => {
  const r = classify(['docs/legal/01-platform-terms.en.md']);
  assert.equal(r.web, true);
  assert.equal(r.edge, true);
});

test('a markdown file inside an app is not docs', () => {
  assert.equal(classify(['apps/web/src/notes.md']).web, true);
  assert.equal(classify(['supabase/functions/README.md']).edge, true);
});

test('marketing-only skips everything here (marketing-ci covers it)', () => {
  assert.deepEqual(classify(['apps/marketing/src/index.html']), {
    web: false, edge: false, a11y: false, db: false,
  });
});

test('web-only skips the Edge Functions and the database', () => {
  const r = classify(['apps/web/src/pages/EnrolCompletePage.tsx']);
  assert.deepEqual(r, { web: true, edge: false, a11y: true, db: false });
});

test('demo-only runs the web suites but not accessibility', () => {
  const r = classify(['apps/web/src/demo/functions.ts', 'apps/web/src/demo/DemoBar.tsx']);
  assert.deepEqual(r, { web: true, edge: false, a11y: false, db: false });
});

test('a non-UI web file runs web but not accessibility (as before)', () => {
  assert.deepEqual(classify(['apps/web/src/lib/format.ts']), { web: true, edge: false, a11y: false, db: false });
});

test('migrations run web too (web tests read them) and the database suites', () => {
  const r = classify(['supabase/migrations/20261103000000_x.sql']);
  assert.equal(r.web, true);
  assert.equal(r.edge, true);
  assert.equal(r.db, true);
});

test('shared code runs the Edge Functions too', () => {
  assert.equal(classify(['packages/shared/src/signerDetails.ts']).edge, true);
  assert.equal(classify(['packages/shared/src/database.types.ts']).db, true);
});

test('unknown or root files run everything they might touch', () => {
  for (const f of ['pnpm-lock.yaml', 'package.json', 'workers/lead-email-ingest/src/index.ts', 'scripts/verify-env.mjs', '.github/workflows/deploy-web.yml']) {
    const r = classify([f]);
    assert.equal(r.web, true, f);
    assert.equal(r.edge, true, f);
  }
});

test('one code file among docs still runs its suites', () => {
  assert.equal(classify(['docs/a.md', 'apps/web/src/App.tsx']).web, true);
});
