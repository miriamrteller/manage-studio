import { describe, expect, it } from 'vitest';
import { AdminDashboardOverviewSchema, FinanceSummarySchema } from '@shared/schemas';
import { FakeSupabaseClient } from './fakeSupabase';
import { baseRpcs } from './rpcs';
import { ADMIN_EMAIL, ADMIN_USER_ID, buildSeed, TENANT_ID, TENANT_SUBDOMAIN } from './seed';

function adminClient() {
  const tables = buildSeed();
  const c = new FakeSupabaseClient({ tables, rpcs: baseRpcs, functions: {} });
  c.setUser({ id: ADMIN_USER_ID, email: ADMIN_EMAIL });
  return { c, tables };
}

describe('demo admin overview / finance / booking RPCs', () => {
  it('get_admin_dashboard_overview raises P0001 without an active season, like the SQL', async () => {
    const { c } = adminClient();
    const { data, error } = await c.rpc('get_admin_dashboard_overview');
    expect(data).toBeNull();
    expect(error).toMatchObject({ code: 'P0001' });
  });

  it('get_admin_dashboard_overview matches the schema when a season exists', async () => {
    const { c, tables } = adminClient();
    tables.seasons.push({ id: 'd0000000-0000-4000-8000-0000000005e1', tenant_id: TENANT_ID, name: '2026', status: 'active' });
    const { data, error } = await c.rpc('get_admin_dashboard_overview');
    expect(error).toBeNull();
    expect(AdminDashboardOverviewSchema.parse(data).season_name).toBe('2026');
  });

  it('get_finance_summary sums succeeded payments in range and matches the schema', async () => {
    const { c, tables } = adminClient();
    const { data, error } = await c.rpc('get_finance_summary', { p_start_date: '2000-01-01', p_end_date: '2100-01-01' });
    expect(error).toBeNull();
    const row = FinanceSummarySchema.parse((data as unknown[])[0]);
    const expected = (tables.payments as { tenant_id: string; status: string; paid_at?: string; total_amount_minor: number }[])
      .filter((p) => p.tenant_id === TENANT_ID && (p.status === 'succeeded' || p.status === 'partially_refunded') && p.paid_at)
      .reduce((a, p) => a + p.total_amount_minor, 0);
    expect(row.net_revenue_minor).toBe(expected);
    expect(expected).toBeGreaterThan(0);

    const bad = await c.rpc('get_finance_summary', { p_start_date: '2026-02-01', p_end_date: '2026-01-01' });
    expect(bad.error?.message).toBe('Invalid date range');
  });

  it('"This month" is never empty: the latest payments are dated today', async () => {
    const { c } = adminClient();
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const monthStart = ymd(new Date(today.getFullYear(), today.getMonth(), 1));
    const { data } = await c.rpc('get_finance_summary', { p_start_date: monthStart, p_end_date: ymd(today) });
    const row = FinanceSummarySchema.parse((data as unknown[])[0]);
    expect(row.net_revenue_minor).toBeGreaterThan(0);
    expect(row.payment_count).toBeGreaterThan(0);
  });

  it('get_finance_summary is admin-only', async () => {
    const { c } = adminClient();
    c.setUser(null);
    const { error } = await c.rpc('get_finance_summary', { p_start_date: '2026-01-01', p_end_date: '2026-12-31' });
    expect(error).not.toBeNull();
  });

  it('get_bookable_offerings_by_subdomain lists appointment packages only when booking is on', async () => {
    const { c, tables } = adminClient();
    const off = await c.rpc('get_bookable_offerings_by_subdomain', { p_subdomain: TENANT_SUBDOMAIN });
    expect(off).toEqual({ data: [], error: null });

    tables.tenant_scheduling_settings = [{ tenant_id: TENANT_ID, is_booking_enabled: true, slot_duration_mins: 60 }];
    const on = await c.rpc('get_bookable_offerings_by_subdomain', { p_subdomain: TENANT_SUBDOMAIN });
    const list = on.data as { id: string; duration_mins: number | null }[];
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((o) => typeof o.duration_mins === 'number')).toBe(true);
  });
});
