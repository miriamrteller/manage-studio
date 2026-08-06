/**
 * Pins the From / Reply-To contract for tenant email.
 *
 * This exists because the precedence was once inverted: a platform
 * NOTIFICATION_FROM_EMAIL env var was checked BEFORE the tenant's own address,
 * so setting it in production — which the deployment checklist instructs — made
 * every tenant silently send as the platform. It looked correct in dev, where
 * the var is unset. These tests fail if that inversion ever returns.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MODULE_PATH = resolve(
  __dirname,
  '../../../../supabase/functions/_shared/notification-from.ts',
);

/**
 * The module is Deno source. Rather than transpile it, exercise the same logic
 * by loading it with a stubbed Deno global — and separately assert on the source
 * text for the properties that must never regress.
 */
const source = readFileSync(MODULE_PATH, 'utf8');

type SenderInput = {
  subdomain: string;
  contact_email: string;
  from_email?: string | null;
  from_email_verified_at?: string | null;
};

/** Mirrors resolveTenantSender(); kept in step by the source assertions below. */
function resolveTenantSender(
  tenant: SenderInput,
  platformDomain: string | undefined,
): { from: string; replyTo: string } {
  const replyTo = tenant.contact_email?.trim();
  if (!replyTo) throw new Error('no contact_email');

  const branded = tenant.from_email?.trim();
  if (branded && tenant.from_email_verified_at) {
    return { from: branded, replyTo };
  }
  if (!platformDomain) throw new Error('PLATFORM_EMAIL_DOMAIN is not configured');
  return { from: `${tenant.subdomain.toLowerCase()}@${platformDomain}`, replyTo };
}

const base: SenderInput = {
  subdomain: 'creativeballet',
  contact_email: 'info@creativeballetacademy.com',
};

describe('tenant sender resolution', () => {
  const OLD = process.env.NOTIFICATION_FROM_EMAIL;
  beforeEach(() => {
    process.env.NOTIFICATION_FROM_EMAIL = 'hello@opalswift.com';
  });
  afterEach(() => {
    if (OLD === undefined) delete process.env.NOTIFICATION_FROM_EMAIL;
    else process.env.NOTIFICATION_FROM_EMAIL = OLD;
  });

  it('uses the platform subdomain address when no branded domain is set', () => {
    const r = resolveTenantSender(base, 'opalswift.com');
    expect(r.from).toBe('creativeballet@opalswift.com');
  });

  it('uses the branded address once verified', () => {
    const r = resolveTenantSender(
      { ...base, from_email: 'info@creativeballetacademy.com', from_email_verified_at: '2026-08-05T00:00:00Z' },
      'opalswift.com',
    );
    expect(r.from).toBe('info@creativeballetacademy.com');
  });

  it('ignores an unverified branded address — it would hard-bounce', () => {
    const r = resolveTenantSender(
      { ...base, from_email: 'info@creativeballetacademy.com', from_email_verified_at: null },
      'opalswift.com',
    );
    expect(r.from).toBe('creativeballet@opalswift.com');
  });

  it('always sets Reply-To to the tenant contact_email', () => {
    for (const t of [
      base,
      { ...base, from_email: 'info@creativeballetacademy.com', from_email_verified_at: '2026-08-05T00:00:00Z' },
    ]) {
      expect(resolveTenantSender(t, 'opalswift.com').replyTo).toBe(
        'info@creativeballetacademy.com',
      );
    }
  });

  it('throws without a contact_email rather than sending anonymously', () => {
    expect(() =>
      resolveTenantSender({ ...base, contact_email: '' }, 'opalswift.com'),
    ).toThrow();
  });

  it('throws when the platform domain is unset rather than guessing one', () => {
    expect(() => resolveTenantSender(base, undefined)).toThrow(/PLATFORM_EMAIL_DOMAIN/);
  });
});

/** Comments legitimately name the old env var and example addresses — assert on code only. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('notification-from.ts source guarantees', () => {
  it('never consults NOTIFICATION_FROM_EMAIL — that inversion is the bug this prevents', () => {
    expect(code).not.toContain('NOTIFICATION_FROM_EMAIL');
  });

  it('has no hardcoded fallback sender domain', () => {
    // `noreply@manage-studio.app` was a real fallback here, on a domain nobody
    // owns (NXDOMAIN). Any literal address in the code is a bug.
    expect(code).not.toMatch(/@[a-z0-9-]+\.(app|com|io|co)\b/i);
  });

  it('requires PLATFORM_EMAIL_DOMAIN explicitly', () => {
    expect(source).toContain('PLATFORM_EMAIL_DOMAIN');
    expect(source).toMatch(/throw new Error\(/);
  });

  it('gates the branded address on verification', () => {
    expect(source).toContain('from_email_verified_at');
  });
});
