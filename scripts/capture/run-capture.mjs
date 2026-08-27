#!/usr/bin/env node
/**
 * One command: reseed the capture fixture, then regenerate every asset.
 *
 *   node scripts/capture/run-capture.mjs            # seed + video + stills
 *   node scripts/capture/run-capture.mjs --video    # seed + video only
 *   node scripts/capture/run-capture.mjs --stills   # seed + stills only
 *   node scripts/capture/run-capture.mjs --no-seed  # skip reseeding
 *   HEADED=1 node scripts/capture/run-capture.mjs   # watch it run
 *
 * Safe to re-run after UI tweaks: seeding is idempotent and cleans up rows
 * created by previous capture runs.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const wantVideo = args.includes('--video') || (!args.includes('--stills'));
const wantStills = args.includes('--stills') || (!args.includes('--video'));
const wantSeed = !args.includes('--no-seed');

if (wantSeed) {
  const seed = spawnSync(process.execPath, [join(here, 'seed-capture.mjs')], { stdio: 'inherit' });
  if (seed.status !== 0) {
    console.error('Seeding failed — aborting capture.');
    process.exit(seed.status ?? 1);
  }
}

if (wantVideo) {
  const { captureVideo } = await import('./capture-video.mjs');
  await captureVideo();
}

if (wantStills) {
  const { captureStills } = await import('./capture-stills.mjs');
  await captureStills();
}

console.log('\nAll captures complete. Output: captures/video + captures/stills');
