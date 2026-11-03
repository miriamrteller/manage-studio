#!/usr/bin/env node
/**
 * After a merge, skip re-running CI when this exact file tree already passed.
 *
 * Each pull_request run of ci.yml uploads a marker artifact named
 * tested-tree-<tree hash of the merge it tested>. A push to main (or develop)
 * looks for markers with its own tree hash and reuses one only if ALL of these
 * hold; on any doubt it prints reuse=false and everything runs:
 *   - the run is this repository's .github/workflows/ci.yml, event pull_request,
 *     and the PR came from this repository (not a fork);
 *   - the run finished and its conclusion is success (fully green);
 *   - every suite job this push needs concluded success in that run (not skipped).
 * The tree includes ci.yml, so the workflow that tested it is the one on main.
 *
 * Usage (in Actions): node scripts/ci/tested-tree.mjs <tree> <job,job,...>
 * Env: GITHUB_TOKEN (actions: read), GITHUB_REPOSITORY, GITHUB_API_URL.
 */
import { pathToFileURL } from 'node:url';

export const MARKER_PREFIX = 'tested-tree-';
const WORKFLOW_PATH = '.github/workflows/ci.yml';

/**
 * Pure check of one candidate run. `jobs` is that run's latest jobs.
 * Returns null when it can be reused, else the reason it cannot.
 */
export function rejectReason({ repo, run, jobs, neededJobs }) {
  if (!run) return 'run not found';
  if (run.repository?.full_name !== repo) return 'run is from another repository';
  if (run.head_repository?.full_name !== repo) return 'PR came from a fork';
  if (run.path !== WORKFLOW_PATH) return `run is ${run.path}, not ${WORKFLOW_PATH}`;
  if (run.event !== 'pull_request') return `run event is ${run.event}`;
  if (run.status !== 'completed' || run.conclusion !== 'success') {
    return `run is ${run.status}/${run.conclusion}, not completed/success`;
  }
  for (const name of neededJobs) {
    const job = (jobs ?? []).find((j) => j.name === name);
    if (!job) return `job ${name} missing`;
    if (job.conclusion !== 'success') return `job ${name} was ${job.conclusion}`;
  }
  return null;
}

async function api(path) {
  const base = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const res = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export async function findReusableRun({ repo, tree, neededJobs, get = api }) {
  if (!/^[0-9a-f]{40}$/.test(tree)) return { reuse: false, reason: 'no tree hash' };
  const { artifacts = [] } = await get(
    `/repos/${repo}/actions/artifacts?name=${MARKER_PREFIX}${tree}&per_page=20`,
  );
  const reasons = [];
  for (const a of artifacts) {
    if (a.name !== `${MARKER_PREFIX}${tree}` || !a.workflow_run?.id) continue;
    const run = await get(`/repos/${repo}/actions/runs/${a.workflow_run.id}`);
    const { jobs } = await get(`/repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
    const reason = rejectReason({ repo, run, jobs, neededJobs });
    if (!reason) return { reuse: true, runUrl: run.html_url };
    reasons.push(`run ${run.id}: ${reason}`);
  }
  return { reuse: false, reason: reasons.join('; ') || 'no marker for this tree' };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [tree = '', jobsArg = ''] = process.argv.slice(2);
  const neededJobs = jobsArg.split(',').map((s) => s.trim()).filter(Boolean);
  let result;
  try {
    result = await findReusableRun({ repo: process.env.GITHUB_REPOSITORY ?? '', tree, neededJobs });
  } catch (err) {
    result = { reuse: false, reason: `lookup failed: ${err.message}` };
  }
  console.log(`reuse=${result.reuse}`);
  console.error(result.reuse ? `Same tree already passed: ${result.runUrl}` : `Full run: ${result.reason}`);
  if (result.runUrl) console.log(`run_url=${result.runUrl}`);
}
