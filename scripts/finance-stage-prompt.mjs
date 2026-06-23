#!/usr/bin/env node
/**
 * Print the Agent prompt for a finance stage from AGENT-RUNBOOK.md.
 *
 * Usage: pnpm finance:prompt g0
 *        pnpm finance:prompt g4   (Grow extension stages g0-g7)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rawArg = process.argv[2]?.toLowerCase();
if (!rawArg || !/^g[0-7]$/.test(rawArg)) {
  console.error('Usage: pnpm finance:prompt <g0-g7>');
  console.error('  g0 = test harness, g1-g7 = Grow extension stages');
  process.exit(1);
}

const stageArg = rawArg.toUpperCase();
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runbookPath = join(root, 'docs/plans/finance/AGENT-RUNBOOK.md');
const runbook = readFileSync(runbookPath, 'utf8');

const heading = `## Stage ${stageArg} —`;

const start = runbook.indexOf(heading);
if (start === -1) {
  console.error(`Section not found for stage ${stageArg} in AGENT-RUNBOOK.md`);
  process.exit(1);
}

const nextHeading = runbook.indexOf('\n## ', start + heading.length);
const section = nextHeading === -1 ? runbook.slice(start) : runbook.slice(start, nextHeading);
const normalized = section.replace(/\r\n/g, '\n');

const fenceRe = /```\n([\s\S]*?)\n```/;
const match = normalized.match(fenceRe);
if (!match) {
  console.error('Prompt code block not found in section');
  process.exit(1);
}

const prompt = match[1];

console.log(`# Finance Stage ${stageArg} — paste into Cursor Agent\n`);
console.log('@docs/plans/finance/AGENT-RUNBOOK.md');
console.log('@.cursor/rules/finance-stages.mdc\n');
console.log(prompt);
