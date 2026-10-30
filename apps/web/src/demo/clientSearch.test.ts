import { describe, expect, it } from 'vitest';
import { FakeSupabaseClient } from './fakeSupabase';
import { extraRpcs, hooks, views } from './extensions';
import { ADMIN_EMAIL, ADMIN_USER_ID, buildSeed, CLIENT_USER_ID, DEMO_CLIENT } from './seed';

function demo(user: 'admin' | 'client' = 'admin') {
  const c = new FakeSupabaseClient({ tables: buildSeed(), rpcs: extraRpcs, functions: {}, hooks, views });
  c.user = user === 'admin' ? { id: ADMIN_USER_ID, email: ADMIN_EMAIL } : { id: CLIENT_USER_ID, email: DEMO_CLIENT.email };
  return c;
}

async function search(q: string) {
  const { data, error } = await demo().rpc('search_enrolment_students', { p_query: q, p_limit: 15 });
  expect(error).toBeNull();
  return (data as { person: { name: string }; accountName: string | null; activeClassNames: string[] }[]).map(
    (r) => r.person.name,
  );
}

describe('demo search_enrolment_students (New shoot → client search)', () => {
  it('finds an existing client by first name', async () => {
    expect(await search('daniel')).toEqual(['Daniel Avraham']);
  });

  it('finds an existing client by email', async () => {
    expect(await search('moshe.shapiro@example.com')).toEqual(['Moshe Shapiro']);
  });

  it('finds an existing client by phone digits, with or without dashes', async () => {
    expect(await search('0534471188')).toEqual(['Daniel Avraham']);
    expect(await search('447-1188')).toEqual(['Daniel Avraham']);
  });

  it('matches partial text anywhere in a word, any case (3 letters is enough)', async () => {
    for (const q of ['dan', 'avr', 'AVR', 'niel', 'Dan Avr']) {
      expect(await search(q)).toContain('Daniel Avraham');
    }
    // 3-digit phone fragment (053-447-1188)
    expect(await search('447')).toContain('Daniel Avraham');
    expect(await search('xyz')).toEqual([]);
  });

  it('matches a local Israeli number against the stored international form and back', async () => {
    const c = demo();
    c.db.people.push({
      id: 'p-intl', tenant_id: c.db.tenants[0].id, account_id: null, name: 'Intl Phone Client',
      email: 'intl@example.com', status: 'active', created_at: '2026-01-01T00:00:00Z',
    });
    c.db.contact_preferences.push({ id: 'cp-intl', person_id: 'p-intl', whatsapp_number: '+972 54-123-4567' });
    const find = async (q: string) =>
      ((await c.rpc('search_enrolment_students', { p_query: q })).data as { person: { name: string } }[]).map(
        (r) => r.person.name,
      );
    expect(await find('054-123')).toEqual(['Intl Phone Client']);
    expect(await find('0541234567')).toEqual(['Intl Phone Client']);
    expect(await find('+972 54 123')).toEqual(['Intl Phone Client']);
    // Seeded client stored as +972 54-772-1903, searched locally — and a local one searched internationally.
    expect(await search('054-772')).toEqual(['Yossi Ben-David']);
    expect(await search('972534471188')).toEqual(['Daniel Avraham']);
  });

  it('requires every token to match and returns the SQL row shape', async () => {
    expect(await search('daniel shapiro')).toEqual([]);
    const { data } = await demo().rpc('search_enrolment_students', { p_query: 'avraham', p_limit: 5 });
    const row = (data as Record<string, unknown>[])[0];
    expect(row).toMatchObject({
      accountName: 'Daniel Avraham',
      isAccountHolder: true,
      activeClassNames: ['Event Coverage (2 hours)'],
    });
    expect(row.person).toMatchObject({ name: 'Daniel Avraham', status: 'active' });
  });

  it('is for the studio only', async () => {
    const { error } = await demo('client').rpc('search_enrolment_students', { p_query: 'daniel' });
    expect(error?.message).toBe('Forbidden');
  });
});

describe('demo client_job_details view', () => {
  it("shows a client only their own shoots, without the gallery URL", async () => {
    const { data } = await demo('client').from('client_job_details').select('*');
    const list = data as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('gallery_url');
    expect(list[0].gallery_released).toBe(false);
  });
});
