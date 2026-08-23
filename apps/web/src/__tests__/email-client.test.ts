/**
 * Cloudflare Email Sending client.
 *
 * The REST API and the Workers binding take DIFFERENT field names for the same
 * things — `from.address` vs `from.email`, `reply_to` vs `replyTo`. Get one
 * wrong and Cloudflare rejects the send or silently drops the field; neither
 * surfaces as a type error, because it is all JSON. These tests pin the wire
 * format we actually send.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { sendHtmlEmail } from '../../../../supabase/functions/_shared/email-client.ts';

const ACCOUNT = 'acct-123';
let fetchMock: ReturnType<typeof vi.fn>;

/** Cloudflare's success envelope. */
function ok(result: Record<string, unknown> = { delivered: ['a@b.test'], permanent_bounces: [], queued: [] }) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, errors: [], result }),
  } as unknown as Response);
}

function body() {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

beforeEach(() => {
  process.env.CLOUDFLARE_ACCOUNT_ID = ACCOUNT;
  process.env.CLOUDFLARE_EMAIL_API_TOKEN = 'token-abc';
  fetchMock = vi.fn(() => ok());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_EMAIL_API_TOKEN;
});

const base = {
  to: 'parent@example.test',
  from: 'creativeballet@opalswift.com',
  subject: 'Hello',
  html: '<p>Hi there</p>',
};

describe('Cloudflare Email REST wire format', () => {
  it('posts to the account-scoped sending endpoint with a bearer token', async () => {
    await sendHtmlEmail(base);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/email/sending/send`,
    );
    expect(init.headers.Authorization).toBe('Bearer token-abc');
  });

  it('uses REST field names, NOT the Workers binding names', async () => {
    await sendHtmlEmail({ ...base, replyTo: 'info@creativeballetacademy.com' });
    const b = body();
    // REST: from.address / reply_to.  Workers: from.email / replyTo.
    expect(b.from).toHaveProperty('address');
    expect(b.from).not.toHaveProperty('email');
    expect(b).toHaveProperty('reply_to');
    expect(b).not.toHaveProperty('replyTo');
  });

  it('splits "Name <addr>" into address and name', async () => {
    await sendHtmlEmail({ ...base, from: 'Creative Ballet <creativeballet@opalswift.com>' });
    expect(body().from).toEqual({
      address: 'creativeballet@opalswift.com',
      name: 'Creative Ballet',
    });
  });

  it('carries Reply-To through as the tenant inbox', async () => {
    await sendHtmlEmail({ ...base, replyTo: 'info@creativeballetacademy.com' });
    expect(body().reply_to.address).toBe('info@creativeballetacademy.com');
  });

  it('omits reply_to entirely when not supplied', async () => {
    await sendHtmlEmail(base);
    expect(body().reply_to).toBeUndefined();
  });
});

describe('plain-text part', () => {
  it('always sends one — Resend never did, and its absence hurts spam scoring', async () => {
    await sendHtmlEmail({ ...base, html: '<p>Hello</p><p>World</p>' });
    expect(body().text).toBe('Hello\nWorld');
  });

  it('strips markup, styles and scripts rather than leaking them', async () => {
    await sendHtmlEmail({
      ...base,
      html: '<style>p{color:red}</style><script>evil()</script><p>Visible</p>',
    });
    const t = body().text;
    expect(t).toBe('Visible');
    expect(t).not.toMatch(/color|evil/);
  });

  it('decodes entities so readers do not see &amp;', async () => {
    await sendHtmlEmail({ ...base, html: '<p>Ballet &amp; Jazz</p>' });
    expect(body().text).toBe('Ballet & Jazz');
  });

  it('accepts an explicit text override', async () => {
    await sendHtmlEmail({ ...base, text: 'custom' });
    expect(body().text).toBe('custom');
  });
});

describe('failure handling', () => {
  it('throws when Cloudflare is not configured, rather than sending nowhere', async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    await expect(sendHtmlEmail(base)).rejects.toThrow(/not configured/i);
  });

  it('surfaces the API error code and message', async () => {
    fetchMock.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          success: false,
          errors: [{ code: 1000, message: 'Sender domain not verified' }],
        }),
      } as unknown as Response),
    );
    await expect(sendHtmlEmail(base)).rejects.toThrow(/1000: Sender domain not verified/);
  });

  it('treats a permanent bounce as a failure, not a success', async () => {
    fetchMock.mockReturnValueOnce(
      ok({ delivered: [], permanent_bounces: ['bad@nowhere.test'], queued: [] }),
    );
    await expect(sendHtmlEmail(base)).rejects.toThrow(/permanently bounced/i);
  });

  it('reports delivery status; Cloudflare returns no provider message id', async () => {
    const r = await sendHtmlEmail(base);
    expect(r.id).toBeNull();
    expect(r.delivered).toEqual(['a@b.test']);
  });
});

describe('Resend fallback (no Cloudflare config)', () => {
  const resendOk = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'resend-msg-1' }),
    } as unknown as Response);

  it('falls back to Resend when only RESEND_API_KEY is set, with Resend wire format', async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_EMAIL_API_TOKEN;
    process.env.RESEND_API_KEY = 're_test';
    fetchMock.mockReturnValueOnce(resendOk());

    const result = await sendHtmlEmail({ ...base, replyTo: 'parent@example.com' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    const sent = JSON.parse(init.body as string);
    expect(sent.from).toBe(base.from); // Resend takes the RFC 5322 string as-is
    expect(sent.to).toEqual([base.to]);
    expect(sent.reply_to).toBe('parent@example.com');
    expect(typeof sent.text).toBe('string');
    expect(result.id).toBe('resend-msg-1');
    expect(result.delivered).toEqual([base.to]);
    delete process.env.RESEND_API_KEY;
  });

  it('prefers Cloudflare when both are configured', async () => {
    process.env.RESEND_API_KEY = 're_test';
    await sendHtmlEmail(base);
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.cloudflare.com');
    delete process.env.RESEND_API_KEY;
  });

  it('still throws when neither transport is configured', async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.RESEND_API_KEY;
    await expect(sendHtmlEmail(base)).rejects.toThrow(/not configured/i);
  });
});
