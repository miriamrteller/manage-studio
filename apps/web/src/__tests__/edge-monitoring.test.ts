import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEvent,
  parseDsn,
  parseStack,
  reportEdgeError,
  scrubMessage,
  withMonitoring,
} from '../../../../supabase/functions/_shared/monitoring.ts';

const DSN = 'https://abc123@o1.ingest.de.sentry.io/4567';

describe('parseDsn', () => {
  it('builds the EU envelope URL', () => {
    expect(parseDsn(DSN)).toEqual({
      envelopeUrl: 'https://o1.ingest.de.sentry.io/api/4567/envelope/',
      publicKey: 'abc123',
      dsn: DSN,
    });
  });
  it('rejects missing or malformed DSNs', () => {
    expect(parseDsn(undefined)).toBeNull();
    expect(parseDsn('')).toBeNull();
    expect(parseDsn('http://abc@host/1')).toBeNull();
    expect(parseDsn('https://host/1')).toBeNull();
  });
});

describe('scrubMessage', () => {
  it('masks personal data and secrets but keeps uuids', () => {
    const out = scrubMessage(
      'insert failed Key (phone)=(0541234567) for dana@example.com at https://api.x.com/v1/pay?key=SECRET tenant 3f6c2a1e-9b0d-4c3e-8f21-7a5b6c4d3e2f apikey tok_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE00',
    );
    expect(out).toContain('Key (phone)=([redacted])');
    expect(out).toContain('[email]');
    expect(out).toContain('https://api.x.com/v1/pay');
    expect(out).not.toContain('SECRET');
    expect(out).toContain('3f6c2a1e-9b0d-4c3e-8f21-7a5b6c4d3e2f');
    expect(out).not.toContain('tok_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE00');
  });
});

describe('parseStack', () => {
  it('parses V8 frames oldest-first and marks vendor code', () => {
    const frames = parseStack(
      'Error: x\n    at inner (file:///home/deno/functions/a/index.ts:10:5)\n    at https://esm.sh/stripe@14/x.js:1:2',
    );
    expect(frames).toEqual([
      { function: '<anonymous>', filename: 'https://esm.sh/stripe@14/x.js', lineno: 1, colno: 2, in_app: false },
      { function: 'inner', filename: '/home/deno/functions/a/index.ts', lineno: 10, colno: 5, in_app: true },
    ]);
  });
});

describe('buildEvent', () => {
  it('turns a Supabase error object into a message-only exception', () => {
    const e = buildEvent({ message: 'boom', details: 'Key (email)=(a@b.co)' }, 'fn', { tenant_id: 't1', skip: undefined });
    expect(e.exception.values[0]).toMatchObject({ type: 'SupabaseError', value: 'boom' });
    expect(JSON.stringify(e)).not.toContain('a@b.co');
    expect(e.tags).toEqual({ function: 'fn', tenant_id: 't1' });
  });
});

describe('reporting', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.SENTRY_DSN;
    vi.restoreAllMocks();
  });

  it('does nothing without SENTRY_DSN', async () => {
    const fetchImpl = vi.fn();
    expect(await reportEdgeError(new Error('x'), 'fn', {}, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts an envelope when SENTRY_DSN is set', async () => {
    process.env.SENTRY_DSN = DSN;
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const id = await reportEdgeError(new Error('broke for dana@example.com'), 'handle-payment-event', { tenant_id: 't1' }, fetchImpl);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://o1.ingest.de.sentry.io/api/4567/envelope/');
    expect(init.headers['X-Sentry-Auth']).toContain('sentry_key=abc123');
    const [, , payload] = (init.body as string).split('\n');
    const event = JSON.parse(payload);
    expect(event.exception.values[0].value).toBe('broke for [email]');
    expect(event.tags).toMatchObject({ function: 'handle-payment-event', tenant_id: 't1' });
  });

  it('never throws when the send fails', async () => {
    process.env.SENTRY_DSN = DSN;
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(reportEdgeError(new Error('x'), 'fn', {}, fetchImpl)).resolves.toBeNull();
  });

  it('withMonitoring returns a generic 500 for a throw and reports it', async () => {
    process.env.SENTRY_DSN = DSN;
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}'));
    const handler = withMonitoring('fn', () => {
      throw new Error('secret internal detail');
    }, fetchImpl);
    const res = await handler(new Request('https://x/functions/v1/fn', { method: 'POST' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('withMonitoring reports 5xx responses but not 4xx, and passes responses through', async () => {
    process.env.SENTRY_DSN = DSN;
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}'));
    const ok = withMonitoring('fn', () => new Response('bad', { status: 400 }), fetchImpl);
    expect((await ok(new Request('https://x'))).status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
    const failing = withMonitoring('fn', () => new Response('down', { status: 502 }), fetchImpl);
    expect((await failing(new Request('https://x'))).status).toBe(502);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('withMonitoring without a DSN behaves exactly like the handler', async () => {
    const fetchImpl = vi.fn();
    const h = withMonitoring('fn', () => new Response('x', { status: 503 }), fetchImpl);
    expect((await h(new Request('https://x'))).status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
