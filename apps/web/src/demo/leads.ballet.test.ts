import { describe, expect, it, vi } from 'vitest';

// Run the shared demo code against the ballet fixtures, as the ballet build does.
vi.mock('./seed', async () => import('./ballet/seed'));

import { FakeSupabaseClient } from './fakeSupabase';
import { leadFunctions, leadRpcs } from './leads';
import { getOutbox } from './outbox';
import { ADMIN_EMAIL, ADMIN_USER_ID, CLASS, TENANT_SUBDOMAIN, buildSeed } from './ballet/seed';

type Row = Record<string, unknown>;

describe('ballet demo: enquiry form → lead', () => {
  it('stores the child and class answers on a new lead', async () => {
    const tables = buildSeed();
    const c = new FakeSupabaseClient({ tables, rpcs: leadRpcs, functions: leadFunctions });
    const { data, error } = await c.functions.invoke('crm-lead-capture', {
      body: {
        tenantSubdomain: TENANT_SUBDOMAIN,
        name: 'Dana Parent',
        email: 'dana@example.test',
        message: 'Is there a trial class?',
        answers: { child_name: 'Yael', child_age: 6, class_interest: CLASS.primarySun, preferred_days: ['sun'] },
      },
    });
    expect(error).toBeNull();
    expect(data).toEqual({ outcome: 'created' });

    c.setUser({ id: ADMIN_USER_ID, email: ADMIN_EMAIL });
    const { data: leads } = await c.from('leads').select('*');
    const lead = (leads as Row[]).find((l) => l.email === 'dana@example.test')!;
    expect(lead).toMatchObject({ child_name: 'Yael', offering_id: CLASS.primarySun, channel: 'website' });
    expect(getOutbox()[0]).toMatchObject({ to: ADMIN_EMAIL, subject: 'New lead: Dana Parent' });
  });

  it('requires the child questions the studio marked required', async () => {
    const c = new FakeSupabaseClient({ tables: buildSeed(), rpcs: leadRpcs, functions: leadFunctions });
    const { data } = await c.functions.invoke('crm-lead-capture', {
      body: { tenantSubdomain: TENANT_SUBDOMAIN, name: 'Dana Parent', email: 'dana@example.test', answers: {} },
    });
    expect((data as Row).error).toBe('invalid_answers');
  });
});
