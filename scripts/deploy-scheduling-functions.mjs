#!/usr/bin/env node
/**
 * Deploys the scheduling Edge Functions one at a time with retry.
 *
 * Why not a single `supabase functions deploy A && ... && Z` chain:
 * the CLI's bundler (JavaScriptCore) can exhaust memory when many deploys run
 * back-to-back, crashing with "MemoryExhaustion" (exit 2147483651). Deploying
 * sequentially with a pause + retry between each keeps peak memory low and is
 * resilient to the occasional transient crash.
 *
 * verify_jwt for each function is pinned in supabase/config.toml, so we deploy
 * without flags and let config govern.
 *
 * Windows note: functions import `../../packages/edge-runtime/...`, which needs
 * `supabase/packages` to resolve to the repo-root `packages/`. On macOS/Linux
 * (or with Docker) this is handled; on a bare Windows checkout create a junction:
 *   mklink /J supabase\packages <repo>\packages   (or New-Item -ItemType Junction)
 */
import { spawnSync } from 'node:child_process';

const FUNCTIONS = [
  'prepare-booking-checkout',
  'get-available-slots',
  'expire-scheduling-holds',
  'google-calendar-oauth-start',
  'google-calendar-oauth-callback',
  'google-calendar-disconnect',
  'google-calendar-freebusy',
  'google-calendar-sync-event',
  // Redeployed because they bundle the shared finalise-payment.ts (Google Calendar sync hook).
  'handle-payment-event',
  'record-payment',
];

const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 6000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deployOne(name) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`\n>>> deploying ${name} (attempt ${attempt}/${MAX_ATTEMPTS})`);
    const res = spawnSync('supabase', ['functions', 'deploy', name], {
      stdio: 'inherit',
      shell: true,
    });
    if (res.status === 0) return true;
    console.warn(`!!! ${name} failed (exit ${res.status}).`);
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }
  return false;
}

const failed = [];
for (const fn of FUNCTIONS) {
  // eslint-disable-next-line no-await-in-loop
  const ok = await deployOne(fn);
  if (!ok) failed.push(fn);
}

if (failed.length) {
  console.error(`\nFAILED to deploy: ${failed.join(', ')}`);
  process.exit(1);
}
console.log('\nAll scheduling functions deployed.');
