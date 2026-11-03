import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findReusableRun, rejectReason } from './tested-tree.mjs';

const REPO = 'owner/repo';
const TREE = 'a'.repeat(40);
const goodRun = {
  id: 7,
  html_url: 'https://github.com/owner/repo/actions/runs/7',
  repository: { full_name: REPO },
  head_repository: { full_name: REPO },
  path: '.github/workflows/ci.yml',
  event: 'pull_request',
  status: 'completed',
  conclusion: 'success',
};
const okJobs = [
  { name: 'lint', conclusion: 'success' },
  { name: 'build', conclusion: 'success' },
  { name: 'sql-tests', conclusion: 'skipped' },
];

test('a fully green same-repo PR run of ci.yml covering the needed jobs is reusable', () => {
  assert.equal(rejectReason({ repo: REPO, run: goodRun, jobs: okJobs, neededJobs: ['lint', 'build'] }), null);
});

test('rejects anything else', () => {
  const cases = [
    [{ ...goodRun, head_repository: { full_name: 'fork/repo' } }, okJobs, ['lint'], /fork/],
    [{ ...goodRun, repository: { full_name: 'other/repo' } }, okJobs, ['lint'], /another repository/],
    [{ ...goodRun, path: '.github/workflows/evil.yml' }, okJobs, ['lint'], /not/],
    [{ ...goodRun, event: 'push' }, okJobs, ['lint'], /event/],
    [{ ...goodRun, conclusion: 'failure' }, okJobs, ['lint'], /failure/],
    [{ ...goodRun, status: 'in_progress', conclusion: null }, okJobs, ['lint'], /in_progress/],
    [goodRun, okJobs, ['sql-tests'], /skipped/],
    [goodRun, okJobs, ['test'], /missing/],
    [null, okJobs, ['lint'], /not found/],
  ];
  for (const [run, jobs, neededJobs, re] of cases) {
    assert.match(rejectReason({ repo: REPO, run, jobs, neededJobs }) ?? '', re);
  }
});

function fakeGet(map) {
  return async (path) => {
    for (const [k, v] of Object.entries(map)) if (path.startsWith(k)) return v;
    throw new Error(`unexpected ${path}`);
  };
}

test('finds the marker run and reuses it', async () => {
  const get = fakeGet({
    [`/repos/${REPO}/actions/artifacts`]: { artifacts: [{ name: `tested-tree-${TREE}`, workflow_run: { id: 7 } }] },
    [`/repos/${REPO}/actions/runs/7/jobs`]: { jobs: okJobs },
    [`/repos/${REPO}/actions/runs/7`]: goodRun,
  });
  const r = await findReusableRun({ repo: REPO, tree: TREE, neededJobs: ['lint', 'build'], get });
  assert.equal(r.reuse, true);
});

test('no marker, a bad tree hash, or a marker for another tree means a full run', async () => {
  const none = fakeGet({ [`/repos/${REPO}/actions/artifacts`]: { artifacts: [] } });
  assert.equal((await findReusableRun({ repo: REPO, tree: TREE, neededJobs: ['lint'], get: none })).reuse, false);
  assert.equal((await findReusableRun({ repo: REPO, tree: 'nope', neededJobs: ['lint'], get: none })).reuse, false);
  const other = fakeGet({
    [`/repos/${REPO}/actions/artifacts`]: { artifacts: [{ name: `tested-tree-${'b'.repeat(40)}`, workflow_run: { id: 7 } }] },
  });
  assert.equal((await findReusableRun({ repo: REPO, tree: TREE, neededJobs: ['lint'], get: other })).reuse, false);
});

test('a red marker run is skipped in favour of a green one', async () => {
  const red = { ...goodRun, id: 6, conclusion: 'failure' };
  const get = fakeGet({
    [`/repos/${REPO}/actions/artifacts`]: {
      artifacts: [
        { name: `tested-tree-${TREE}`, workflow_run: { id: 6 } },
        { name: `tested-tree-${TREE}`, workflow_run: { id: 7 } },
      ],
    },
    [`/repos/${REPO}/actions/runs/6/jobs`]: { jobs: okJobs },
    [`/repos/${REPO}/actions/runs/7/jobs`]: { jobs: okJobs },
    [`/repos/${REPO}/actions/runs/6`]: red,
    [`/repos/${REPO}/actions/runs/7`]: goodRun,
  });
  assert.equal((await findReusableRun({ repo: REPO, tree: TREE, neededJobs: ['lint'], get })).reuse, true);
});
