// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isStopMessage,
  isValidTwilioRequest,
  twilioSignature,
} from '../../../../supabase/functions/_shared/twilio-signature.ts';
import {
  isUnsubscribePayload,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from '../../../../supabase/functions/_shared/unsubscribe-token.ts';
import { withAdvertisementPrefix } from '../../../../supabase/functions/send-notification/marketing.ts';
import { CONSENT_WORDING_VERSION, consentWording, MARKETING_KINDS, PHOTO_KINDS } from '@/legal/consents';

const TENANT = '00000000-0000-0000-0000-000000000001';
const PERSON = '30000000-0000-0000-0000-000000000001';

/** Minimal stand-in for the service client: only the secret RPC is used. */
function fakeService(secrets: Record<string, string>) {
  return {
    rpc: async (_name: string, args: { p_tenant_id: string }) => {
      const secret = secrets[args.p_tenant_id];
      return secret ? { data: secret, error: null } : { data: null, error: { message: 'no secret' } };
    },
  } as never;
}

describe('twilio signature', () => {
  const params = { Body: 'STOP', From: '+972501234567', To: '+15005550006' };
  const url = 'https://example.supabase.co/functions/v1/twilio-inbound';

  it('accepts a request signed with the auth token', async () => {
    const sig = await twilioSignature('secret-token', url, params);
    expect(await isValidTwilioRequest('secret-token', url, params, sig)).toBe(true);
  });

  it('rejects a wrong token, a changed parameter, or no signature', async () => {
    const sig = await twilioSignature('secret-token', url, params);
    expect(await isValidTwilioRequest('other-token', url, params, sig)).toBe(false);
    expect(await isValidTwilioRequest('secret-token', url, { ...params, Body: 'hi' }, sig)).toBe(false);
    expect(await isValidTwilioRequest('secret-token', url, params, null)).toBe(false);
  });

  it('signs parameters sorted by name', async () => {
    const a = await twilioSignature('t', url, { b: '2', a: '1' });
    const b = await twilioSignature('t', url, { a: '1', b: '2' });
    expect(a).toBe(b);
  });
});

describe('STOP detection', () => {
  it.each(['STOP', 'stop', ' Stop ', 'הסר', 'הסרה', 'unsubscribe', 'הסר!'])('treats "%s" as an opt-out', (body) => {
    expect(isStopMessage(body)).toBe(true);
  });
  it.each(['', 'stop sending the schedule please', 'שלום', 'start'])('does not treat "%s" as an opt-out', (body) => {
    expect(isStopMessage(body)).toBe(false);
  });
});

describe('unsubscribe token', () => {
  const service = fakeService({ [TENANT]: 'tenant-secret' });

  it('round-trips a person token', async () => {
    const token = await signUnsubscribeToken(service, { v: 1, tid: TENANT, pid: PERSON, ch: 'email' });
    expect(await verifyUnsubscribeToken(service, token)).toEqual({ v: 1, tid: TENANT, pid: PERSON, ch: 'email' });
  });

  it('rejects a tampered payload or signature', async () => {
    const token = await signUnsubscribeToken(service, { v: 1, tid: TENANT, pid: PERSON, ch: 'email' });
    const [body, sig] = token.split('.');
    const otherBody = btoa(JSON.stringify({ v: 1, tid: TENANT, pid: PERSON, ch: 'sms' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    expect(await verifyUnsubscribeToken(service, `${otherBody}.${sig}`)).toBeNull();
    expect(await verifyUnsubscribeToken(service, `${body}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(await verifyUnsubscribeToken(service, 'garbage')).toBeNull();
  });

  it('rejects a token signed with another tenant secret', async () => {
    const other = fakeService({ [TENANT]: 'different-secret' });
    const token = await signUnsubscribeToken(service, { v: 1, tid: TENANT, pid: PERSON, ch: 'email' });
    expect(await verifyUnsubscribeToken(other, token)).toBeNull();
  });

  it('requires exactly one of person or lead', () => {
    expect(isUnsubscribePayload({ v: 1, tid: TENANT, ch: 'email' })).toBe(false);
    expect(isUnsubscribePayload({ v: 1, tid: TENANT, pid: PERSON, lid: PERSON, ch: 'email' })).toBe(false);
    expect(isUnsubscribePayload({ v: 1, tid: TENANT, lid: PERSON, ch: 'sms' })).toBe(true);
  });
});

describe('marketing subject', () => {
  it('starts every marketing subject with פרסומת, once', () => {
    expect(withAdvertisementPrefix('Summer workshop')).toBe('פרסומת: Summer workshop');
    expect(withAdvertisementPrefix('פרסומת: סדנת קיץ')).toBe('פרסומת: סדנת קיץ');
  });
});

describe('consent wording', () => {
  it('fills the student and studio names', () => {
    expect(consentWording('photo_public', 'he', { student: 'נועה' })).toContain('נועה');
    expect(consentWording('marketing_email', 'en', { studio: 'Creative Ballet' })).toContain('Creative Ballet');
  });

  it('has wording for every kind in both languages', () => {
    for (const kind of [...PHOTO_KINDS, ...MARKETING_KINDS, 'portfolio' as const]) {
      expect(consentWording(kind, 'he').length).toBeGreaterThan(10);
      expect(consentWording(kind, 'en').length).toBeGreaterThan(10);
    }
    expect(CONSENT_WORDING_VERSION).toMatch(/^[0-9a-f]{8}-/);
  });
});
