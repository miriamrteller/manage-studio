/**
 * writeInboundLead with enquiry-form answers (step 2b): new leads get the typed
 * columns and leads.answers; a repeat enquiry from the same email merges
 * answers and never blanks earlier ones; email leads (no form) are unchanged.
 * Run: pnpm -C apps/web test lead-ingest-form-write
 */
import { describe, expect, it, vi } from 'vitest';
import { writeInboundLead } from '../../../../supabase/functions/_shared/crm-contract/lead-ingest-core.ts';

type Row = Record<string, unknown>;

/** Minimal stand-in for the service client: records inserts/updates, returns `open` for the open-lead lookup. */
function fakeService(open: Row | null) {
  const inserts: Row[] = [];
  const updates: Row[] = [];
  const chain = (result: unknown): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'is', 'order', 'limit']) c[m] = () => c;
    c.maybeSingle = async () => ({ data: result, error: null });
    c.single = async () => ({ data: result, error: null });
    c.then = (resolve: (v: unknown) => void) => resolve({ error: null });
    return c;
  };
  const service = {
    from: vi.fn(() => ({
      select: () => chain(open),
      insert: (row: Row) => {
        inserts.push(row);
        return chain({ id: 'new-lead' });
      },
      update: (row: Row) => {
        updates.push(row);
        return chain(null);
      },
    })),
  };
  return { service: service as never, inserts, updates };
}

const tenant = {
  id: 't-1',
  name: 'Studio',
  subdomain: 'studio',
  language_default: 'en',
  contact_email: 'studio@example.test',
  from_email: null,
  from_email_verified_at: null,
};
const fields = { name: 'Dana', email: 'dana@example.test', phone: null, interest: null, lastCommunicationNote: 'Hi' };
const opts = { channel: 'website' as const, sourceRef: null, receivedAt: '2026-11-02T10:00:00Z' };
const form = {
  columns: { child_name: 'Noa', offering_id: 'off-1' },
  answers: { experience: { label: { en: 'Previous experience', he: 'ניסיון קודם' }, value: 'none' } },
};

describe('writeInboundLead with form answers', () => {
  it('a new lead gets the typed columns and the answers; consent stays false', async () => {
    const f = fakeService(null);
    const result = await writeInboundLead(f.service, tenant, fields, { ...opts, form });
    expect(result).toEqual({ outcome: 'created', leadId: 'new-lead' });
    expect(f.inserts[0]).toMatchObject({ child_name: 'Noa', offering_id: 'off-1', answers: form.answers, marketing_consent: false });
  });

  it('a repeat enquiry merges answers and keeps earlier ones', async () => {
    const earlier = { preferred_days: { label: { en: 'Preferred days', he: 'ימים מועדפים' }, value: ['mon'] } };
    const f = fakeService({ id: 'open-1', answers: earlier });
    const result = await writeInboundLead(f.service, tenant, fields, { ...opts, form });
    expect(result).toEqual({ outcome: 'updated', leadId: 'open-1' });
    expect(f.updates[0]).toMatchObject({ child_name: 'Noa', offering_id: 'off-1' });
    expect(f.updates[0].answers).toEqual({ ...earlier, ...form.answers });
  });

  it('a repeat enquiry with no answers does not touch them', async () => {
    const f = fakeService({ id: 'open-1', answers: { x: 1 } });
    await writeInboundLead(f.service, tenant, fields, { ...opts, form: { columns: {}, answers: {} } });
    expect(f.updates[0]).not.toHaveProperty('answers');
  });

  it('email leads (no form) insert exactly the fields they did before', async () => {
    const f = fakeService(null);
    await writeInboundLead(f.service, tenant, fields, { channel: 'email', sourceRef: null, receivedAt: opts.receivedAt });
    expect(Object.keys(f.inserts[0]).sort()).toEqual(
      ['campaign', 'channel', 'email', 'interest', 'last_communication_note', 'last_contacted_at', 'marketing_consent', 'name', 'phone', 'source_ref', 'stage', 'tenant_id'].sort(),
    );
  });
});
