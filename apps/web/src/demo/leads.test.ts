import { describe, expect, it } from 'vitest';
import { FakeSupabaseClient } from './fakeSupabase';
import { leadFunctions, leadRpcs } from './leads';
import { getOutbox } from './outbox';
import { ADMIN_EMAIL, ADMIN_USER_ID, TENANT_ID, TENANT_SUBDOMAIN, buildSeed } from './seed';

type Row = Record<string, unknown>;

function client() {
  const tables = buildSeed();
  const c = new FakeSupabaseClient({ tables, rpcs: leadRpcs, functions: leadFunctions });
  return { c, tables };
}

const enquiry = (extra: Row = {}) => ({
  tenantSubdomain: TENANT_SUBDOMAIN,
  name: 'Noa Demo',
  email: 'Noa@example.test',
  phone: null,
  message: 'Looking for a photographer in June',
  src: 'instagram',
  campaign: '  spring  sale ',
  captchaToken: null,
  website: null,
  answers: { event_type: 'wedding', event_date: '2027-06-10', budget_range: '5000_10000' },
  marketingConsent: null,
  ...extra,
});

describe('photographer demo: enquiry form → lead', () => {
  it('get_lead_form returns the studio questions', async () => {
    const { c } = client();
    const { data, error } = await c.rpc('get_lead_form', { p_tenant_id: TENANT_ID });
    expect(error).toBeNull();
    expect((data as { presets: Row }).presets.event_type).toEqual({ enabled: true, required: true });
  });

  it('creates a new lead the admin can see on the Leads page, and emails the studio', async () => {
    const { c, tables } = client();
    const before = tables.leads.length;
    const { data, error } = await c.functions.invoke('crm-lead-capture', { body: enquiry() });
    expect(error).toBeNull();
    expect(data).toEqual({ outcome: 'created' });
    expect(tables.leads.length).toBe(before + 1);

    c.setUser({ id: ADMIN_USER_ID, email: ADMIN_EMAIL });
    const { data: leads } = await c.from('leads').select('*').eq('email', 'noa@example.test');
    const lead = (leads as Row[])[0];
    expect(lead).toMatchObject({ name: 'Noa Demo', stage: 'new', channel: 'instagram', campaign: 'spring sale', event_date: '2027-06-10' });
    expect(Object.keys(lead.answers as Row)).toEqual(expect.arrayContaining(['event_type', 'budget_range']));
    expect(getOutbox()[0]).toMatchObject({ subject: 'New lead: Noa Demo', link: { href: '#/admin/leads' } });
  });

  it('a second enquiry from the same email updates the open lead', async () => {
    const { c, tables } = client();
    await c.functions.invoke('crm-lead-capture', { body: enquiry() });
    const count = tables.leads.length;
    const { data } = await c.functions.invoke('crm-lead-capture', { body: enquiry({ message: 'Any news?' }) });
    expect(data).toEqual({ outcome: 'updated' });
    expect(tables.leads.length).toBe(count);
    expect(tables.leads.find((l) => l.email === 'noa@example.test')?.last_communication_note).toBe('Any news?');
  });

  it('rejects a missing required answer, and stores nothing for the honeypot', async () => {
    const { c, tables } = client();
    const before = tables.leads.length;
    const bad = await c.functions.invoke('crm-lead-capture', { body: enquiry({ answers: {} }) });
    expect((bad.data as Row).error).toBe('invalid_answers');
    const bot = await c.functions.invoke('crm-lead-capture', { body: enquiry({ website: 'spam' }) });
    expect(bot.data).toEqual({ outcome: 'created' });
    expect(tables.leads.length).toBe(before);
  });

  it('records marketing opt-ins on the lead', async () => {
    const { c, tables } = client();
    await c.functions.invoke('crm-lead-capture', {
      body: enquiry({ marketingConsent: { version: 'v1', items: [{ kind: 'marketing_email', wording: 'Send me news' }] } }),
    });
    const lead = tables.leads.find((l) => l.email === 'noa@example.test')!;
    expect(lead.marketing_consent).toBe(true);
    expect(tables.consent_records.some((r) => r.lead_id === lead.id && r.kind === 'marketing_email')).toBe(true);
  });

  it('send-lead-form-link emails the form link or the website steps (admin only)', async () => {
    const { c } = client();
    const anon = await c.functions.invoke('send-lead-form-link', { body: { kind: 'form', email: 'a@example.test' } });
    expect(anon.error).not.toBeNull();

    c.setUser({ id: ADMIN_USER_ID, email: ADMIN_EMAIL });
    const bad = await c.functions.invoke('send-lead-form-link', { body: { kind: 'form', email: 'nope' } });
    expect((bad.data as Row).error).toBe('invalid_email');

    const form = await c.functions.invoke('send-lead-form-link', {
      body: { kind: 'form', email: 'Friend@Example.test', name: 'Avi', lang: 'en' },
    });
    expect(form.data).toEqual({ ok: true });
    expect(getOutbox()[0]).toMatchObject({
      to: 'friend@example.test',
      subject: 'Lumen & Light Photography: enquiry form',
      link: { href: '#/inquire?src=direct' },
    });

    const web = await c.functions.invoke('send-lead-form-link', {
      body: { kind: 'web_instructions', email: 'web@example.test', name: null, lang: 'he' },
    });
    expect(web.data).toEqual({ ok: true });
    expect(getOutbox()[0].subject).toContain('לאתר');
    expect(getOutbox()[0].body).toContain('<iframe');
  });
});
