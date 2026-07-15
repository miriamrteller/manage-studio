#!/usr/bin/env node
/**
 * Writes supabase/.temp/google-calendar-secrets.env from repo-root .env.
 * Used by `pnpm secrets:google-calendar` to push Edge Function secrets.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const outPath = join(root, 'supabase', '.temp', 'google-calendar-secrets.env');

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
const required = ['GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'APP_URL'];

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
