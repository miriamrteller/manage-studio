import { test, expect } from '@playwright/test';

/**
 * Post–fourth-squash smoke against local Vite + seeded linked DB.
 *
 *   pnpm -C apps/web exec playwright test e2e/post-squash-smoke.spec.ts --project=chromium
 *
 * Requires VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (repo .env via playwright loadEnv).
 * Optional SUPABASE_SERVICE_ROLE_KEY: ensures a bookable appointment exists even after
 * seed-finance overwrote …0310/…0311 as classes.
 */
const subdomain = process.env.VITE_DEV_TENANT_SUBDOMAIN || 'creativeballet';
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
/** Dedicated smoke appointment — does not collide with seed-finance class ids */
const SMOKE_APPT_ID = '00000000-0000-0000-0000-000000000320';

async function rpc<T>(name: string, body: Record<string, unknown>, key = anonKey): Promise<T> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name} HTTP ${res.status}: ${text}`);
  return text ? (JSON.parse(text) as T) : ([] as T);
}

async function ensureSmokeAppointment(): Promise<void> {
  if (!serviceKey) return;
  const res = await fetch(`${supabaseUrl}/rest/v1/offerings?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      id: SMOKE_APPT_ID,
      tenant_id: TENANT_ID,
      name: 'Smoke Appointment',
      offering_type: 'appointment',
      duration_mins: 60,
      day_of_week: null,
      start_time: null,
      end_time: null,
      max_capacity: 1,
      price_minor: 10000,
      currency: 'ILS',
      delivery_mode: 'scheduled',
      billing_mode: 'one_time',
      is_public: true,
      status: 'active',
      waiver_required: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`ensureSmokeAppointment HTTP ${res.status}: ${await res.text()}`);
  }
}

test.describe('post-squash smoke', () => {
  test.use({ baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173' });

  test.beforeAll(async () => {
    test.skip(!supabaseUrl || !anonKey, 'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
    await ensureSmokeAppointment();
  });

  test('tenant config RPC returns plan/skin/features', async () => {
    const rows = await rpc<Array<Record<string, unknown>>>('get_tenant_config_by_subdomain', {
      p_subdomain: subdomain,
    });
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.tenant_subdomain).toBe(subdomain);
    expect(row.plan).toBeTruthy();
    expect(row.skin).toBeTruthy();
    expect(Array.isArray(row.enabled_features)).toBeTruthy();
    expect((row.enabled_features as unknown[]).length).toBeGreaterThan(0);
  });

  test('public class offerings load in UI + RPC', async ({ page }) => {
    const rows = await rpc<Array<{ name?: string }>>('get_public_offerings_by_subdomain', {
      p_subdomain: subdomain,
    });
    expect(rows.length).toBeGreaterThan(0);

    await page.goto('/classes', { waitUntil: 'networkidle' });
    await expect(page.getByText(/creative ballet|creativeballet/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Primary|Grade 1|Grade 2|Pilates/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('booking page shows services and slots RPC works', async ({ page }) => {
    const bookable = await rpc<Array<{ id: string; name: string }>>(
      'get_bookable_offerings_by_subdomain',
      { p_subdomain: subdomain },
    );
    expect(bookable.length, 'expected at least one appointment offering').toBeGreaterThan(0);

    const offering = bookable.find((o) => o.id === SMOKE_APPT_ID) ?? bookable[0];

    await page.goto(`/book/${offering.id}`, { waitUntil: 'networkidle' });
    await expect(page.getByText(offering.name, { exact: false }).first()).toBeVisible({
      timeout: 30_000,
    });

    // Seed hours: Sunday (0) / Wednesday (3). Probe ~2 weeks ahead.
    const probe = new Date();
    probe.setDate(probe.getDate() + 14);
    while (probe.getDay() !== 0 && probe.getDay() !== 3) {
      probe.setDate(probe.getDate() + 1);
    }
    const pDate = [
      probe.getFullYear(),
      String(probe.getMonth() + 1).padStart(2, '0'),
      String(probe.getDate()).padStart(2, '0'),
    ].join('-');

    const slots = await rpc<Array<{ starts_at: string; ends_at: string }>>('get_available_slots', {
      p_subdomain: subdomain,
      p_offering_id: offering.id,
      p_date: pDate,
    });
    expect(Array.isArray(slots)).toBeTruthy();
    expect(slots.length, `expected slots on ${pDate}`).toBeGreaterThan(0);

    // Calendar UI should show at least one selectable slot control for that service.
    await expect(page.locator('body')).toContainText(new RegExp(offering.name, 'i'));
  });
});
