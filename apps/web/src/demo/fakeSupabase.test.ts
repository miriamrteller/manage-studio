import { describe, expect, it } from 'vitest';
import { FakeSupabaseClient, type Tables } from './fakeSupabase';
import { canRead } from './rls';

function seed(): Tables {
  return {
    user_profiles: [
      { id: 'admin', role: ['tenant_admin'] },
      { id: 'client', role: ['account_holder'] },
    ],
    accounts: [{ id: 'a1' }, { id: 'a2' }],
    account_members: [
      { id: 'm1', account_id: 'a1', user_profile_id: 'client' },
      { id: 'm2', account_id: 'a2', user_profile_id: null },
    ],
    people: [
      { id: 'p1', account_id: 'a1', name: 'Dana' },
      { id: 'p2', account_id: 'a2', name: 'Avi' },
    ],
    contact_preferences: [{ id: 'c1', person_id: 'p1', whatsapp_number: '050' }],
    offerings: [{ id: 'o1', name: 'Family Session', price_minor: 95000 }],
    engagements: [
      { id: 'e1', person_id: 'p1', offering_id: 'o1', status: 'active', created_at: '2026-01-02' },
      { id: 'e2', person_id: 'p2', offering_id: 'o1', status: 'cancelled', created_at: '2026-01-01' },
    ],
    job_details: [
      { engagement_id: 'e1', tenant_id: 't', job_status: 'booked' },
      { engagement_id: 'e2', tenant_id: 't', job_status: 'enquiry' },
    ],
  };
}

function client(user: 'admin' | 'client' | null = 'admin') {
  const c = new FakeSupabaseClient({ tables: seed(), rpcs: {}, functions: {}, hooks: { canRead } });
  if (user) c.user = { id: user, email: `${user}@example.com` };
  return c;
}

describe('demo fake supabase client', () => {
  it('resolves nested many-to-one and one-to-many embeds', async () => {
    const { data } = await client()
      .from('job_details')
      .select('engagement_id, engagements!inner(id, people(name, contact_preferences(whatsapp_number)), offerings(name))')
      .eq('engagement_id', 'e1')
      .single();
    expect(data).toEqual({
      engagement_id: 'e1',
      engagements: {
        id: 'e1',
        people: { name: 'Dana', contact_preferences: [{ whatsapp_number: '050' }] },
        offerings: { name: 'Family Session' },
      },
    });
  });

  it('embeds a 1:1 child keyed by its primary key as an object', async () => {
    const { data } = await client().from('engagements').select('id, job_details(job_status)').eq('id', 'e2').single();
    expect(data).toEqual({ id: 'e2', job_details: { job_status: 'enquiry' } });
  });

  it('filters, orders, counts and supports or()', async () => {
    const c = client();
    const ordered = await c.from('engagements').select('id').order('created_at', { ascending: true });
    expect((ordered.data as { id: string }[]).map((r) => r.id)).toEqual(['e2', 'e1']);
    const counted = await c.from('engagements').select('*', { count: 'exact', head: true }).eq('status', 'active');
    expect(counted.count).toBe(1);
    const either = await c.from('people').select('id').or('name.eq.Avi,name.ilike.*zz*');
    expect(either.data).toEqual([{ id: 'p2' }]);
  });

  it('inserts with generated ids and returns the row', async () => {
    const c = client();
    const { data } = await c.from('people').insert({ name: 'New', account_id: 'a1' }).select('id, name').single();
    expect((data as { id: string }).id).toMatch(/[0-9a-f-]{36}/);
    expect(c.db.people).toHaveLength(3);
  });

  it('limits a signed-in client to their own account', async () => {
    const asClient = client('client');
    const people = await asClient.from('people').select('id');
    expect(people.data).toEqual([{ id: 'p1' }]);
    const own = await asClient.from('engagements').select('id');
    expect(own.data).toEqual([{ id: 'e1' }]);
    // job_details holds the gallery URL: clients never read it directly.
    const jobs = await asClient.from('job_details').select('engagement_id');
    expect(jobs.data).toEqual([]);
    const anon = await client(null).from('people').select('id');
    expect(anon.data).toEqual([]);
  });
});
