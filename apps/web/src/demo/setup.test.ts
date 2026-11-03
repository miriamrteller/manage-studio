import { describe, expect, it } from 'vitest';
import { FakeSupabaseClient } from './fakeSupabase';
import { baseRpcs } from './rpcs';
import { setupFunctions, setupRpcs } from './setup';
import { ADMIN_EMAIL, ADMIN_USER_ID, TENANT_ID, buildSeed } from './seed';

function client(admin = true) {
  const tables = buildSeed();
  const c = new FakeSupabaseClient({ tables, rpcs: { ...baseRpcs, ...setupRpcs }, functions: setupFunctions });
  if (admin) c.setUser({ id: ADMIN_USER_ID, email: ADMIN_EMAIL });
  return { c, tables };
}

describe('demo studio setup handlers', () => {
  it('confirming the legal pack shows up in the legal profile', async () => {
    const { c } = client();
    const before = await c.rpc('get_tenant_legal_profile', { p_tenant_id: TENANT_ID });
    expect((before.data as Array<Record<string, unknown>>)[0].legal_pack_acknowledged_at).toBeNull();

    const ensured = await c.functions.invoke('provision-studio', { body: { action: 'ensure_signed_template' } });
    expect(ensured.data).toEqual({ ok: true });
    const ack = await c.rpc('acknowledge_studio_legal_pack', { p_version: 'v1', p_language: 'en' });
    expect(ack.error).toBeNull();

    const after = await c.rpc('get_tenant_legal_profile', { p_tenant_id: TENANT_ID });
    expect((after.data as Array<Record<string, unknown>>)[0].legal_pack_acknowledged_at).toBe(ack.data);
  });

  it('only a studio admin can confirm, with a valid language', async () => {
    const anon = client(false).c;
    expect((await anon.rpc('acknowledge_studio_legal_pack', { p_version: 'v1', p_language: 'en' })).error).not.toBeNull();
    const { c } = client();
    expect((await c.rpc('acknowledge_studio_legal_pack', { p_version: 'v1', p_language: 'fr' })).error).not.toBeNull();
  });

  it('YPay: test fails until credentials are saved, then passes', async () => {
    const { c } = client();
    expect((await c.functions.invoke('verify-ypay-credentials')).data).toMatchObject({ valid: false });
    const saved = await c.rpc('save_tenant_ypay_credentials', { p_client_id: 'demo-id', p_client_secret: 'demo-secret' });
    expect(saved.error).toBeNull();
    expect((await c.functions.invoke('verify-ypay-credentials')).data).toEqual({ valid: true });
  });

  it('Grow notice key: none until rotated, then configured', async () => {
    const { c } = client();
    const before = await c.rpc('get_grow_webhook_key_status');
    expect((before.data as Array<Record<string, unknown>>)[0].configured).toBe(false);
    const key = await c.rpc('rotate_grow_webhook_key');
    expect(typeof key.data).toBe('string');
    const after = await c.rpc('get_grow_webhook_key_status');
    expect((after.data as Array<Record<string, unknown>>)[0]).toMatchObject({ configured: true, key_version: 1 });
  });

  it('lawyer-reviewed documents: save, list, revert; forms can be marked reviewed', async () => {
    const { c, tables } = client();
    expect((await c.rpc('get_tenant_legal_documents', { p_tenant_id: TENANT_ID })).data).toEqual([]);
    const saved = await c.rpc('save_tenant_legal_document', {
      p_document: 'enrolment-terms', p_language: 'he', p_kind: 'text', p_content: 'Reviewed terms',
    });
    expect(saved.error).toBeNull();
    const list = (await c.rpc('get_tenant_legal_documents', { p_tenant_id: TENANT_ID })).data as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ document: 'enrolment-terms', kind: 'text', content: 'Reviewed terms' });
    expect((await c.rpc('revert_tenant_legal_document', { p_document: 'enrolment-terms' })).data).toBe(true);
    expect((await c.rpc('revert_tenant_legal_document', { p_document: 'enrolment-terms' })).data).toBe(false);
    expect((await c.rpc('save_tenant_legal_document', { p_document: 'nope', p_language: 'he', p_kind: 'text', p_content: 'x' })).error).not.toBeNull();

    const template = (tables.consent_templates ?? [])[0];
    if (template) {
      await c.rpc('set_consent_template_lawyer_reviewed', { p_template_id: template.id, p_reviewed: true });
      expect(template.lawyer_reviewed_at).toBeTruthy();
      await c.rpc('set_consent_template_lawyer_reviewed', { p_template_id: template.id, p_reviewed: false });
      expect(template.lawyer_reviewed_at).toBeNull();
    }
  });

  it('link_my_guardian_accounts links unlinked memberships with the login email, once', async () => {
    const { c, tables } = client();
    const person = { id: 'p-link', tenant_id: TENANT_ID, name: 'Guest Parent', email: 'Guest@Example.test' };
    (tables.people ??= []).push(person);
    (tables.account_members ??= []).push({ id: 'am-link', tenant_id: TENANT_ID, person_id: 'p-link', role: 'account_holder', user_profile_id: null });
    const profile = { id: 'u-guest', tenant_id: TENANT_ID, role: ['parent'], email: 'guest@example.test' };
    (tables.user_profiles ??= []).push(profile);
    c.setUser({ id: 'u-guest', email: 'guest@example.test' });
    expect((await c.rpc('link_my_guardian_accounts')).data).toBe(1);
    expect(tables.account_members.find((m) => m.id === 'am-link')?.user_profile_id).toBe('u-guest');
    expect((await c.rpc('link_my_guardian_accounts')).data).toBe(0);
  });
});
