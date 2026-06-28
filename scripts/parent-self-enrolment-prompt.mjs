#!/usr/bin/env node
/**
 * Print the Agent prompt for a parent-self-enrolment stage.
 *
 * Usage: pnpm parent-self-enrolment:prompt p1
 *        pnpm parent-self-enrolment:prompt p3
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rawArg = process.argv[2]?.toLowerCase();
if (!rawArg || !/^p[1-3]$/.test(rawArg)) {
  console.error('Usage: pnpm parent-self-enrolment:prompt <p1-p3>');
  process.exit(1);
}

const stageNum = rawArg.slice(1);
const stageArg = `P${stageNum}`;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runbookPath = join(root, 'docs/plans/parent-self-enrolment/AGENT-RUNBOOK.md');
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

console.log(`# Parent self-enrolment Stage ${stageArg} — paste into Cursor Agent\n`);
console.log('@docs/plans/parent-self-enrolment/CONTRACTS.md');
console.log('@.cursor/rules/parent-self-enrolment.mdc');
console.log('@docs/plans/parent-self-enrolment/AGENT-RUNBOOK.md\n');
console.log(prompt);
