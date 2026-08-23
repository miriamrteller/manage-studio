/**
 * Contract tripwire for the crm-contacts edge function.
 *
 * The mobile-crm app validates every response against the v1 contract
 * (vendored at supabase/functions/_shared/crm-contract/) and renders an error
 * state on any mismatch. These tests pin (a) that the vendored schema still
 * accepts the vendored golden fixture, and (b) that the mapper the edge
 * function serves — mapContacts — emits contract-valid envelopes with the
 * documented stage table and null-honesty rules. If hardening churn changes
 * a source column or status in a way that breaks the CRM feed, this fails
 * before the CRM does.
 */
import { describe, expect, it } from 'vitest';

import {
  contactsResponseSchemaV1,
} from '../../../../supabase/functions/_shared/crm-contract/contact.v1.ts';
import goldenFixture from '../../../../supabase/functions/_shared/crm-contract/fixtures/contacts.v1.json';
import {
  mapContacts,
  type CrmContactsInput,
} from '../../../../supabase/functions/_shared/crm-contract/map-contacts.ts';

const TENANT = { name: 'Creative Ballet Academy', currency: 'ILS' };

function baseInput(overrides: Partial<CrmContactsInput> = {}): CrmContactsInput {
  return {
    tenant: TENANT,
    accounts: [],
    people: [],
    contactPreferences: [],
    engagements: [],
    payments: [],
    offerings: [],
    notifications: [],
    ...overrides,
  };
}

/** Guardian account with one student — the canonical seeded shape. */
function sternFamily(): CrmContactsInput {
  return baseInput({
    accounts: [{ id: 'acc-1', person_id: 'guardian-1' }],
    people: [
      { id: 'guardian-1', account_id: 'acc-1', name: 'Miriam R Stern', email: 'stern@example.com' },
      { id: 'child-1', account_id: 'acc-1', name: 'Ruti Stern', email: null },
    ],
    contactPreferences: [
      {
        person_id: 'guardian-1',
        email_opted_in: true,
        notify_announcements: true,
        whatsapp_number: '+972501234567',
        voice_number: null,
      },
    ],
    engagements: [
      { person_id: 'child-1', status: 'active', payment_received_at: '2026-08-01T10:00:00Z' },
      { person_id: 'child-1', status: 'pending_payment', payment_received_at: null },
    ],
    payments: [
      {
        account_id: 'acc-1',
        person_id: 'child-1',
        offering_id: 'off-1',
        charge_type: 'initial',
        status: 'succeeded',
        total_amount_minor: 24000,
        paid_at: '2026-08-01T10:00:00Z',
      },
    ],
    offerings: [{ id: 'off-1', name: 'Pre-Primary Ballet' }],
    notifications: [
      {
        recipient_person_id: 'guardian-1',
        status: 'sent',
        subject: 'Enrolment confirmed',
        body_preview: 'Ruti is enrolled in Pre-Primary Ballet',
        sent_at: '2026-08-02T09:00:00Z',
        created_at: '2026-08-02T09:00:00Z',
      },
    ],
  });
}

describe('vendored contract', () => {
  it('accepts the vendored golden fixture (schema is faithful to mobile-crm)', () => {
    const parsed = contactsResponseSchemaV1.safeParse(goldenFixture);
    expect(parsed.success).toBe(true);
  });
});

describe('mapContacts contract compliance', () => {
  it('emits a contract-valid envelope with contractVersion 1 and tenant currency', () => {
    const envelope = mapContacts(sternFamily());
    const parsed = contactsResponseSchemaV1.safeParse(envelope);
    expect(parsed.success).toBe(true);
    expect(envelope.contractVersion).toBe(1);
    expect(envelope.currency).toBe('ILS');
  });

  it('maps the guardian account: Won stage, real deal value, real touchpoints', () => {
    const [contact] = mapContacts(sternFamily()).contacts;
    expect(contact).toMatchObject({
      id: 'acc-1',
      name: 'Miriam R Stern',
      email: 'stern@example.com',
      phone: '+972501234567',
      stage: 'Won', // active engagement wins over the open pending_payment one
      channel: 'Website',
      dealValue: 240, // ₪24000 minor → 240
      lastContactedAt: '2026-08-02T09:00:00Z',
      lastCommunicationNote: 'Enrolment confirmed',
      lastProductPurchased: 'Pre-Primary Ballet',
      owner: 'Creative Ballet Academy',
      previousClient: false,
      marketingConsent: true,
    });
  });

  it('falls back to ILS when the tenant currency is not a valid ISO 4217 code', () => {
    const input = sternFamily();
    input.tenant = { name: 'X', currency: null };
    expect(mapContacts(input).currency).toBe('ILS');
  });
});

describe('stage mapping table', () => {
  const cases: Array<[string, Array<{ status: string; paid: boolean }>, string]> = [
    ['any active → Won', [{ status: 'cancelled', paid: true }, { status: 'active', paid: true }], 'Won'],
    ['pending_payment → Proposal', [{ status: 'pending_payment', paid: false }], 'Proposal'],
    ['pending_waiver → Proposal', [{ status: 'pending_waiver', paid: false }], 'Proposal'],
    ['pending_offer → Proposal', [{ status: 'pending_offer', paid: false }], 'Proposal'],
    ['admin_review → Qualified', [{ status: 'admin_review', paid: false }], 'Qualified'],
    ['historical-only → Lost', [{ status: 'cancelled', paid: true }, { status: 'withdrawn', paid: false }], 'Lost'],
    ['no engagements at all → New (account contact)', [], 'New'],
  ];

  it.each(cases)('%s', (_label, engagements, expectedStage) => {
    const input = baseInput({
      accounts: [{ id: 'acc-1', person_id: 'p-1' }],
      people: [{ id: 'p-1', account_id: 'acc-1', name: 'Test Parent', email: null }],
      engagements: engagements.map((e) => ({
        person_id: 'p-1',
        status: e.status,
        payment_received_at: e.paid ? '2026-01-01T00:00:00Z' : null,
      })),
    });
    const [contact] = mapContacts(input).contacts;
    expect(contact.stage).toBe(expectedStage);
  });

  it('flags previousClient only for ended engagements that were actually paid', () => {
    const paid = baseInput({
      accounts: [{ id: 'a', person_id: 'p' }],
      people: [{ id: 'p', account_id: 'a', name: 'P', email: null }],
      engagements: [{ person_id: 'p', status: 'cancelled', payment_received_at: '2026-01-01T00:00:00Z' }],
    });
    expect(mapContacts(paid).contacts[0].previousClient).toBe(true);

    const unpaid = baseInput({
      accounts: [{ id: 'a', person_id: 'p' }],
      people: [{ id: 'p', account_id: 'a', name: 'P', email: null }],
      engagements: [{ person_id: 'p', status: 'cancelled', payment_received_at: null }],
    });
    expect(mapContacts(unpaid).contacts[0].previousClient).toBe(false);
  });
});

describe('null honesty — unsourceable fields are null, never fabricated', () => {
  it('adult student with no data beyond an enrolment gets nulls, not placeholders', () => {
    const input = baseInput({
      people: [{ id: 'adult-1', account_id: null, name: 'Sara Gold', email: null }],
      engagements: [{ person_id: 'adult-1', status: 'pending_payment', payment_received_at: null }],
    });
    const envelope = mapContacts(input);
    expect(contactsResponseSchemaV1.safeParse(envelope).success).toBe(true);

    const [contact] = envelope.contacts;
    expect(contact).toMatchObject({
      id: 'adult-1',
      stage: 'Proposal',
      company: null,
      title: null,
      email: null,
      phone: null,
      dealValue: null, // no succeeded payments → null, not 0
      lastContactedAt: null,
      nextFollowUpAt: null,
      note: null, // medical_notes / allergies must never surface here
      lastCommunicationNote: null,
      lastProductPurchased: null,
      lastProductInquired: null,
    });
  });

  it('people without any engagement or account are not contacts', () => {
    const input = baseInput({
      people: [{ id: 'stray-1', account_id: null, name: 'Stub Row', email: null }],
    });
    expect(mapContacts(input).contacts).toHaveLength(0);
  });

  it('respects an explicit marketing opt-out', () => {
    const input = sternFamily();
    input.contactPreferences = [
      {
        person_id: 'guardian-1',
        email_opted_in: true,
        notify_announcements: false,
        whatsapp_number: null,
        voice_number: null,
      },
    ];
    expect(mapContacts(input).contacts[0].marketingConsent).toBe(false);
  });

  it('nets refunds into dealValue', () => {
    const input = sternFamily();
    input.payments.push({
      account_id: 'acc-1',
      person_id: 'child-1',
      offering_id: 'off-1',
      charge_type: 'refund',
      status: 'succeeded',
      total_amount_minor: -6000,
      paid_at: '2026-08-05T10:00:00Z',
    });
    expect(mapContacts(input).contacts[0].dealValue).toBe(180);
  });
});
