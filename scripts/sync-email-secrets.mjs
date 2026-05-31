#!/usr/bin/env node
/**
 * Writes supabase/.temp/email-secrets.env from repo-root .env.
 * Supabase CLI is invoked by pnpm (see package.json secrets:email) so Windows
 * does not break on `<` in NOTIFICATION_FROM_EMAIL via CMD.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const outPath = join(root, 'supabase', '.temp', 'email-secrets.env');

function parseEnvFile(path) {
  const text = readFileSync(path, 'utf8');
  const out = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\$/, '').trim();
    out[key] = value;
  }
  return out;
}

const env = parseEnvFile(envPath);
const required = [
  'RESEND_API_KEY',
  'NOTIFICATION_FROM_EMAIL',
  'SEND_EMAIL_HOOK_SECRET',
];

const missing = required.filter((k) => !env[k]);
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(', ')}`);
  process.exit(1);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  required.map((k) => `${k}=${env[k]}`).join('\n') + '\n',
  'utf8',
);

console.log(`Wrote ${outPath}`);
