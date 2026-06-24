#!/usr/bin/env node
/**
 * Print the Agent prompt for an admin-dashboard-finance stage.
 *
 * Usage: pnpm finance-admin:prompt f1
 *        pnpm finance-admin:prompt f6
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rawArg = process.argv[2]?.toLowerCase();
if (!rawArg || !/^f[1-6]$/.test(rawArg)) {
  console.error('Usage: pnpm finance-admin:prompt <f1-f6>');
  process.exit(1);
}

const stageNum = rawArg.slice(1);
const stageArg = `F${stageNum}`;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runbookPath = join(root, 'docs/plans/admin-dashboard-finance/AGENT-RUNBOOK.md');
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

console.log(`# Admin finance Stage ${stageArg} — paste into Cursor Agent\n`);
console.log('@docs/plans/admin-dashboard-finance/CONTRACTS.md');
console.log('@.cursor/rules/admin-finance-stages.mdc');
console.log('@docs/plans/admin-dashboard-finance/AGENT-RUNBOOK.md\n');
console.log(prompt);
