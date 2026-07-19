#!/usr/bin/env node
/**
 * Writes supabase/.temp/edge-secrets.env from repo-root .env for:
 *   pnpm secrets:edge
 *
 * Only known Edge Function secrets are copied (never VITE_*, DB password,
 * or per-tenant Grow merchant keys — those go through admin UI).
 *
 * Derives GROW_NOTIFY_URL / ICOUNT_NOTIFY_URL from the project URL when omitted.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const outPath = join(root, 'supabase', '.temp', 'edge-secrets.env');

/** Must be present in .env */
const REQUIRED = [
  'APP_URL',
  'CRON_SECRET',
  'RESEND_API_KEY',
  'NOTIFICATION_FROM_EMAIL',
  'SEND_EMAIL_HOOK_SECRET',
];

/** Copied when non-empty in .env */
const OPTIONAL = [
  'GROW_API_BASE',
  'GROW_NOTIFY_URL',
  'GROW_MOCK',
  'ICOUNT_NOTIFY_URL',
  'ICOUNT_MOCK',
  'ISSUE_DOCUMENT_URL',
  'SYNC_ISSUE_DOCUMENT_IN_DEV',
  'GREEN_INVOICE_API_BASE',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'TWILIO_VERIFY_SERVICE_SID',
  'GOOGLE_CALENDAR_CLIENT_ID',
  'GOOGLE_CALENDAR_CLIENT_SECRET',
  'GOOGLE_CALENDAR_MOCK',
  'ANTHROPIC_API_KEY',
  'WAIVER_LINK_SECRET',
  'DEFAULT_TENANT_ID',
  'TRANZILA_CALLBACK_SECRET',
  'TRANZILA_STO_TERMINAL_NAME',
  'TRANZILA_MOCK',
];

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

function resolveSupabaseUrl(env) {
  for (const key of ['VITE_SUPABASE_URL', 'SUPABASE_URL']) {
    const v = env[key];
    if (v && /^https?:\/\//i.test(v)) return v.replace(/\/$/, '');
  }
  if (env.SUPABASE_PROJECT_REF) {
    return `https://${env.SUPABASE_PROJECT_REF}.supabase.co`;
  }
  return null;
}

const env = parseEnvFile(envPath);

const missing = REQUIRED.filter((k) => !env[k]);
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(', ')}`);
  process.exit(1);
}

const secrets = {};
for (const key of REQUIRED) {
  secrets[key] = env[key];
}
for (const key of OPTIONAL) {
  if (env[key]) secrets[key] = env[key];
}

const projectUrl = resolveSupabaseUrl(env);
if (projectUrl) {
  if (!secrets.GROW_NOTIFY_URL) {
    secrets.GROW_NOTIFY_URL = `${projectUrl}/functions/v1/handle-payment-event`;
  }
  if (!secrets.ICOUNT_NOTIFY_URL) {
    secrets.ICOUNT_NOTIFY_URL = `${projectUrl}/functions/v1/handle-payment-event`;
  }
  if (!secrets.ISSUE_DOCUMENT_URL) {
    secrets.ISSUE_DOCUMENT_URL = `${projectUrl}/functions/v1/issue-document`;
  }
} else if (!secrets.GROW_NOTIFY_URL) {
  console.warn(
    'Warning: could not derive GROW_NOTIFY_URL (set VITE_SUPABASE_URL or SUPABASE_PROJECT_REF, or GROW_NOTIFY_URL).',
  );
}

if ((secrets.GROW_MOCK ?? '').toLowerCase() === 'true') {
  console.warn(
    'Warning: GROW_MOCK=true will be pushed — live Meshulam charges will not run. Unset for sandbox/live E2E.',
  );
}

mkdirSync(dirname(outPath), { recursive: true });
const body =
  Object.entries(secrets)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n';
writeFileSync(outPath, body, 'utf8');

console.log(`Wrote ${outPath}`);
console.log(`Keys (${Object.keys(secrets).length}): ${Object.keys(secrets).sort().join(', ')}`);
console.log(
  'Note: Grow merchant userId / pageCode / apiKey are NOT Edge secrets — save via admin UI.',
);
