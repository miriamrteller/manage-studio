import { describe, expect, it, vi } from 'vitest';

// Run the shared demo code against the ballet fixtures, as the ballet build does.
vi.mock('./seed', async () => import('./ballet/seed'));

import { FakeSupabaseClient } from './fakeSupabase';
import { baseFunctions } from './functions';
import { baseRpcs } from './rpcs';
import { danceFunctions, danceRpcs } from './dance';
import { ADMIN_EMAIL, ADMIN_USER_ID, CLASS, CLIENT_USER_ID, DEMO_CLIENT, SEASON_ID, buildSeed } from './ballet/seed';

type Row = Record<string, unknown>;

function client(as: 'admin' | 'parent' = 'parent') {
  const tables = buildSeed();
  const c = new FakeSupabaseClient({
    tables,
    rpcs: { ...baseRpcs, ...danceRpcs },
    functions: { ...baseFunctions, ...danceFunctions },
  });
  c.setUser(as === 'admin' ? { id: ADMIN_USER_ID, email: ADMIN_EMAIL } : { id: CLIENT_USER_ID, email: DEMO_CLIENT.email });
  return { c, tables };
}

const person = (tables: Record<string, Row[]>, name: string) => tables.people.find((p) => p.name === name)!;
const latest = (tables: Record<string, Row[]>) => tables.engagements[tables.engagements.length - 1];

describe('ballet demo: enrol, sign, pay at the studio', () => {
  it('creates a pending_payment place with a billing account and returns the offline charge', async () => {
    const { c, tables } = client();
    const ari = person(tables, 'Ari Levi');
    const { data, error } = await c.functions.invoke('prepare-enrolment-checkout', {
      body: { phase: 'pay', mode: 'create_engagement', person_id: ari.id, offering_id: CLASS.grade2Sun, season_id: SEASON_ID },
    });
    expect(error).toBeNull();
    // Unsigned: the place is reserved but payment is blocked on the declaration.
    const res = data as { context: Row; charge: Row | null; blockReason?: string };
    expect(res.charge).toBeNull();
    expect(res.blockReason).toBe('waiver_required');
    const eng = latest(tables);
    expect(eng).toMatchObject({ person_id: ari.id, offering_id: CLASS.grade2Sun, status: 'pending_payment' });
    expect(eng.billing_account_id).toBeTruthy();

    await c.functions.invoke('accept-waiver', {
      body: {
        person_id: ari.id, offering_id: CLASS.grade2Sun, consent_template_id: tables.consent_templates[0].id,
        consent_version: 1, typed_name: 'Noa Levi', idempotency_key: 'k0', engagement_id: eng.id, guardian_confirmed: true,
      },
    });
    const pay = await c.functions.invoke('prepare-enrolment-checkout', {
      body: { phase: 'pay', mode: 'existing_engagement', engagement_id: eng.id },
    });
    expect((pay.data as { charge: Row }).charge.paymentProvider).toBe('offline');
  });

  it('refuses a duplicate enrolment and an out-of-range age for a parent', async () => {
    const { c, tables } = client();
    const maya = person(tables, 'Maya Levi');
    const dup = await c.functions.invoke('prepare-enrolment-checkout', {
      body: { phase: 'pay', mode: 'create_engagement', person_id: maya.id, offering_id: CLASS.grade1Sun, season_id: SEASON_ID },
    });
    expect(dup.error).not.toBeNull();
    const age = await c.functions.invoke('prepare-enrolment-checkout', {
      body: { phase: 'pay', mode: 'create_engagement', person_id: maya.id, offering_id: CLASS.grade3Sun, season_id: SEASON_ID },
    });
    expect(age.error).not.toBeNull();
  });

  it('accept-waiver links the declaration to a pending_payment place', async () => {
    const { c, tables } = client();
    const ari = person(tables, 'Ari Levi');
    await c.functions.invoke('prepare-enrolment-checkout', {
      body: { phase: 'pay', mode: 'create_engagement', person_id: ari.id, offering_id: CLASS.grade2Sun, season_id: SEASON_ID },
    });
    const eng = latest(tables);
    const template = tables.consent_templates[0];
    const { data, error } = await c.functions.invoke('accept-waiver', {
      body: {
        person_id: ari.id, offering_id: CLASS.grade2Sun, consent_template_id: template.id, consent_version: 1,
        typed_name: 'Noa Levi', idempotency_key: 'k1', engagement_id: eng.id, guardian_confirmed: true,
      },
    });
    expect(error).toBeNull();
    expect(eng.waiver_evidence_id).toBe((data as Row).evidence_id);
  });
});

describe('ballet demo: studio actions', () => {
  it('record-payment activates a signed place and books a manual cash payment', async () => {
    const { c, tables } = client('admin');
    const pending = tables.engagements.find((e) => e.status === 'pending_payment' && e.waiver_evidence_id)!;
    const { data, error } = await c.functions.invoke('record-payment', { body: { engagement_id: pending.id, method: 'cash' } });
    expect(error).toBeNull();
    expect(pending.status).toBe('active');
    const pay = tables.payments.find((p) => p.id === (data as Row).paymentId)!;
    expect(pay).toMatchObject({ provider: 'manual', payment_method: 'cash', status: 'succeeded', invoice_url: null });
    const again = await c.functions.invoke('record-payment', { body: { engagement_id: pending.id, method: 'cash' } });
    expect(again.error).not.toBeNull();
  });

  it('record-payment without a signed declaration leaves the place pending_waiver', async () => {
    const { c, tables } = client('admin');
    const pending = tables.engagements.find((e) => e.status === 'pending_payment')!;
    pending.waiver_evidence_id = null;
    tables.waiver_evidence = tables.waiver_evidence.filter((w) => w.person_id !== pending.person_id);
    await c.functions.invoke('record-payment', { body: { engagement_id: pending.id, method: 'bank_transfer' } });
    expect(pending.status).toBe('pending_waiver');
    expect(pending.waiver_deadline).toBeTruthy();
  });

  it('record-payment is admin-only', async () => {
    const { c, tables } = client('parent');
    const pending = tables.engagements.find((e) => e.status === 'pending_payment')!;
    const { error } = await c.functions.invoke('record-payment', { body: { engagement_id: pending.id, method: 'cash' } });
    expect(error).not.toBeNull();
    expect(pending.status).toBe('pending_payment');
  });

  it('approve_age_review_engagement moves admin_review to pending_payment and returns the row', async () => {
    const { c, tables } = client('admin');
    const review = tables.engagements.find((e) => e.status === 'admin_review')!;
    const { data, error } = await c.rpc('approve_age_review_engagement', { p_engagement_id: review.id, p_admin_reason: 'ok' });
    expect(error).toBeNull();
    expect((data as Row).status).toBe('pending_payment');
    expect(review.age_override_reason).toBe('ok');
  });

  it('cancel_engagement refuses an active (paid) place', async () => {
    const { c, tables } = client('admin');
    const active = tables.engagements.find((e) => e.status === 'active')!;
    const { error } = await c.rpc('cancel_engagement', { p_engagement_id: active.id });
    expect(error).not.toBeNull();
  });

  it("dashboard overview lists today's classes from the active season", async () => {
    const { c, tables } = client('admin');
    const { data, error } = await c.rpc('get_admin_dashboard_overview');
    expect(error).toBeNull();
    const today = new Date().getDay();
    const expected = tables.offerings.filter((o) => o.day_of_week === today).length;
    expect(((data as Row).today_classes as unknown[]).length).toBe(expected);
  });
});
