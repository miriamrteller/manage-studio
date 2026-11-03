import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { scrubBreadcrumb, scrubEvent, scrubPath, scrubText, scrubUrl } from '../lib/monitoring/scrub';

const UUID = '3f6c2a1e-9b0d-4c3e-8f21-7a5b6c4d3e2f';

describe('scrubPath', () => {
  it('keeps static segments and replaces ids', () => {
    expect(scrubPath('/admin/setup/bundled-payments')).toBe('/admin/setup/bundled-payments');
    expect(scrubPath(`/admin/jobs/${UUID}`)).toBe('/admin/jobs/:id');
    expect(scrubPath('/book/42')).toBe('/book/:id');
  });

  it('always redacts the token after /pay and /quote, even if it looks like a word', () => {
    expect(scrubPath('/pay/abcdef')).toBe('/pay/:token');
    expect(scrubPath('/quote/Xy9_k2-LmN')).toBe('/quote/:token');
  });
});

describe('scrubUrl', () => {
  it('drops query string and hash (auth callback tokens live in the hash)', () => {
    expect(scrubUrl('https://studio.opalswift.com/auth/callback#access_token=eyJabc&refresh_token=x')).toBe(
      'https://studio.opalswift.com/auth/callback',
    );
    expect(scrubUrl('https://x.supabase.co/rest/v1/people?email=eq.dana@example.com')).toBe(
      'https://x.supabase.co/rest/v1/people',
    );
  });

  it('handles relative URLs', () => {
    expect(scrubUrl(`/admin/families/${UUID}?tab=billing`)).toBe('/admin/families/:id');
  });
});

describe('scrubText', () => {
  it('redacts emails, phones, JWTs and Postgres key details', () => {
    const out = scrubText(
      'duplicate key value violates unique constraint. Key (email)=(dana@example.com) phone 054-123-4567 token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij',
    );
    expect(out).not.toMatch(/dana@example\.com/);
    expect(out).not.toMatch(/054-123-4567/);
    expect(out).not.toMatch(/eyJhbGci/);
    expect(out).toContain('Key (email)=([redacted])');
  });

  it('redacts a 9-digit ID number (signer details must never reach an error report)', () => {
    const out = scrubText('sign failed for id 123456782 and "id_number":"012345674"');
    expect(out).not.toMatch(/123456782/);
    expect(out).not.toMatch(/012345674/);
  });

  it('scrubs URLs embedded in messages', () => {
    expect(scrubText('Failed GET https://a.opalswift.com/pay/secret123?x=1')).toBe(
      'Failed GET https://a.opalswift.com/pay/:token',
    );
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console and click breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'Dana Cohen' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'ui.click', message: 'button[aria-label="Dana"]' })).toBeNull();
  });

  it('keeps fetch breadcrumbs with only a scrubbed url, method and status', () => {
    const b = scrubBreadcrumb({
      category: 'fetch',
      data: { url: '/rest/v1/people?name=eq.Dana', method: 'GET', status_code: 500, request_body_size: 10 },
    });
    expect(b?.data).toEqual({ url: '/rest/v1/people', method: 'GET', status_code: 500 });
  });
});

describe('scrubEvent', () => {
  it('keeps only user id, scrubs request and exception, drops extras', () => {
    const event = {
      type: undefined,
      user: { id: UUID, email: 'dana@example.com', ip_address: '1.2.3.4', username: 'dana' },
      request: { url: 'https://a.opalswift.com/pay/tok?x=1', headers: { Cookie: 'sb=1' }, data: '{"card":1}' },
      transaction: `/admin/jobs/${UUID}`,
      exception: { values: [{ type: 'Error', value: 'cannot email dana@example.com' }] },
      extra: { form: { name: 'Dana' } },
      contexts: { browser: { name: 'Chrome' }, state: { form: 'x' } },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.user).toEqual({ id: UUID });
    expect(out.request).toEqual({ url: 'https://a.opalswift.com/pay/:token' });
    expect(out.transaction).toBe('/admin/jobs/:id');
    expect(out.exception?.values?.[0].value).toBe('cannot email [email]');
    expect(out.extra).toBeUndefined();
    expect(out.contexts?.state).toBeUndefined();
    expect(out.contexts?.browser).toEqual({ name: 'Chrome' });
  });
});
