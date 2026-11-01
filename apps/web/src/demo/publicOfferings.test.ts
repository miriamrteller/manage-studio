import { describe, expect, it } from 'vitest';
import { FakeSupabaseClient } from './fakeSupabase';
import { baseRpcs } from './rpcs';
import { buildSeed, TENANT_SUBDOMAIN } from './seed';

describe('demo get_public_offerings_by_subdomain', () => {
  it('answers like the SQL: only active public class offerings (none for the photographer)', async () => {
    const tables = buildSeed();
    const c = new FakeSupabaseClient({ tables, rpcs: baseRpcs, functions: {} });
    const { data, error } = await c.rpc('get_public_offerings_by_subdomain', { p_subdomain: TENANT_SUBDOMAIN });
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const tenantId = (tables.tenants[0] as { id: string }).id;
    tables.offerings.push({ id: 'o-class', tenant_id: tenantId, name: 'Workshop', offering_type: 'class', is_public: true, status: 'active' });
    tables.offerings.push({ id: 'o-private', tenant_id: tenantId, name: 'Hidden', offering_type: 'class', is_public: false, status: 'active' });
    const again = await c.rpc('get_public_offerings_by_subdomain', { p_subdomain: TENANT_SUBDOMAIN });
    expect((again.data as { id: string; tenant_subdomain: string }[]).map((r) => [r.id, r.tenant_subdomain])).toEqual([
      ['o-class', TENANT_SUBDOMAIN],
    ]);
  });
});
