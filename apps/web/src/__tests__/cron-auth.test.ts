/**
 * Scheduled-job functions refuse every request when CRON_SECRET is missing
 * (fail closed), and accept only the exact secret.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rejectUnlessCron } from '../../../../supabase/functions/_shared/edge-runtime/cron-auth.ts';

const before = process.env.CRON_SECRET;
afterEach(() => {
  if (before === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = before;
});

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/fn', { method: 'POST', headers });
}

describe('rejectUnlessCron', () => {
  it('refuses every request when CRON_SECRET is not set', () => {
    delete process.env.CRON_SECRET;
    expect(rejectUnlessCron(req())?.status).toBe(500);
    expect(rejectUnlessCron(req({ 'x-cron-secret': '' }))?.status).toBe(500);
    expect(rejectUnlessCron(req({ authorization: 'Bearer ' }))?.status).toBe(500);
  });

  it('accepts the secret in x-cron-secret or as a Bearer token', () => {
    process.env.CRON_SECRET = 's3cret';
    expect(rejectUnlessCron(req({ 'x-cron-secret': 's3cret' }))).toBeNull();
    expect(rejectUnlessCron(req({ authorization: 'Bearer s3cret' }))).toBeNull();
  });

  it('refuses a wrong, partial or missing secret', () => {
    process.env.CRON_SECRET = 's3cret';
    expect(rejectUnlessCron(req())?.status).toBe(401);
    expect(rejectUnlessCron(req({ 'x-cron-secret': 's3cre' }))?.status).toBe(401);
    expect(rejectUnlessCron(req({ 'x-cron-secret': 's3cret!' }))?.status).toBe(401);
    expect(rejectUnlessCron(req({ authorization: 'Bearer wrong' }))?.status).toBe(401);
    expect(rejectUnlessCron(req({ authorization: 's3cret' }))?.status).toBe(401);
  });
});

describe('scheduled-job functions use the shared check', () => {
  const FUNCTIONS = [
    'check-invoicing-auth',
    'check-missing-documents',
    'expire-scheduling-holds',
    'issue-document',
    'run-enrolment-payment-dunning',
    'run-job-payment-reminders',
    'run-lead-followup-digest',
    'run-monthly-billing',
    'run-shoot-emails',
    'send-waiver-reminder',
  ];
  for (const name of FUNCTIONS) {
    it(name, () => {
      const src = readFileSync(resolve(__dirname, `../../../../supabase/functions/${name}/index.ts`), 'utf8');
      expect(src).toContain('rejectUnlessCron(req)');
      expect(src).not.toMatch(/if \(!CRON_SECRET\) return true/);
      expect(src).not.toMatch(/Deno\.env\.get\("CRON_SECRET"\)/);
    });
  }
});
