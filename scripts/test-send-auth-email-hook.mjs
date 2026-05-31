#!/usr/bin/env node
/**
 * Invoke deployed send-auth-email with a signed Standard Webhooks payload
 * (same shape Supabase Auth uses). Prints the real JSON error body.
 *
 *   node scripts/test-send-auth-email-hook.mjs
 *   TEST_EMAIL=you@example.com node scripts/test-send-auth-email-hook.mjs
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Webhook } from 'standardwebhooks';
import { loadEnv } from './load-env.mjs';

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const hookSecretRaw = process.env.SEND_EMAIL_HOOK_SECRET?.trim();
const testEmail = process.env.TEST_EMAIL ?? 'hook-test@example.com';

if (!supabaseUrl || !hookSecretRaw) {
  console.error('Need SUPABASE_URL and SEND_EMAIL_HOOK_SECRET in .env');
  process.exit(1);
}

const hookSecret = hookSecretRaw.startsWith('v1,whsec_')
  ? hookSecretRaw.replace(/^v1,whsec_/, 'whsec_')
  : hookSecretRaw.startsWith('whsec_')
    ? hookSecretRaw
    : `whsec_${hookSecretRaw}`;

const payload = JSON.stringify({
  user: {
    email: testEmail,
    user_metadata: { subdomain: 'creativeballet' },
  },
  email_data: {
    token: '123456',
    token_hash: 'test-token-hash-' + randomUUID().slice(0, 8),
    redirect_to: 'http://localhost:5173/auth/callback',
    email_action_type: 'magiclink',
    site_url: 'http://localhost:5173',
    token_new: '',
    token_hash_new: '',
  },
});

const wh = new Webhook(hookSecret);
const msgId = randomUUID();
const timestamp = new Date();
const signature = wh.sign(msgId, timestamp, payload);
const tsSec = Math.floor(timestamp.getTime() / 1000);

const url = `${supabaseUrl}/functions/v1/send-auth-email`;
const bodyPath = join(tmpdir(), `send-auth-email-hook-${process.pid}.json`);
writeFileSync(bodyPath, payload, 'utf8');

console.log('POST', url);
console.log('email:', testEmail);

// Use curl (-k) so corporate TLS inspection does not block Node fetch on Windows.
const curl = spawnSync(
  'curl',
  [
    '-sk',
    '-X',
    'POST',
    url,
    '-H',
    'Content-Type: application/json',
    '-H',
    `webhook-id: ${msgId}`,
    '-H',
    `webhook-timestamp: ${tsSec}`,
    '-H',
    `webhook-signature: ${signature}`,
    '--data-binary',
    `@${bodyPath}`,
    '-w',
    '\nHTTP:%{http_code}\n',
  ],
  { encoding: 'utf8' },
);

const out = (curl.stdout || '') + (curl.stderr || '');
const httpMatch = out.match(/HTTP:(\d+)/);
const http = httpMatch ? httpMatch[1] : '?';
const body = out.replace(/\nHTTP:\d+\n?$/, '').trim();

console.log('HTTP', http);
try {
  console.log(JSON.stringify(JSON.parse(body), null, 2));
} catch {
  console.log(body || '(empty)');
}

if (curl.status !== 0) {
  process.exit(curl.status || 1);
}
