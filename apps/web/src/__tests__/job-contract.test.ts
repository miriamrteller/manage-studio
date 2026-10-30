/**
 * Job contract merge-field rendering (shared by get-waiver-engagement and
 * accept-waiver). Both sides must render identically so wording_snapshot and
 * consent_version_hash cover the text the client actually saw.
 */
import { describe, expect, it } from 'vitest';
import {
  canSignJobContract,
  formatJobDate,
  formatJobPrice,
  loadJobContractPrice,
  renderJobContract,
  resolveJobContractPrice,
  type PriceQueryClient,
} from '../../../../supabase/functions/_shared/job-contract.ts';

const FIELDS = {
  client_name: 'נועה ואיתי לוי',
  shoot_date: 'Friday 13 November 2026 at 14:30',
  location: 'HaYarkon Park',
  package: 'Family Lifestyle Session',
  price: '₪520.00',
};

describe('renderJobContract', () => {
  it('replaces every known merge field, with or without inner spaces', () => {
    const out = renderJobContract(
      'Client: {{client_name}} / {{ package }} on {{SHOOT_DATE}} at {{location}} for {{price}}',
      FIELDS,
    );
    expect(out).toBe(
      'Client: נועה ואיתי לוי / Family Lifestyle Session on Friday 13 November 2026 at 14:30 at HaYarkon Park for ₪520.00',
    );
  });

  it('leaves unknown fields visible rather than silently blanking them', () => {
    expect(renderJobContract('Hello {{client_name}}, ref {{invoice_no}}', FIELDS)).toBe(
      'Hello נועה ואיתי לוי, ref {{invoice_no}}',
    );
  });

  it('is deterministic for the same inputs', () => {
    const template = '{{client_name}}\n{{shoot_date}}\n{{price}}';
    expect(renderJobContract(template, FIELDS)).toBe(renderJobContract(template, FIELDS));
  });

  it('returns plain templates untouched', () => {
    expect(renderJobContract('No fields here.', FIELDS)).toBe('No fields here.');
  });
});

describe('formatJobDate / formatJobPrice', () => {
  it('uses a language-specific placeholder when the shoot is not scheduled', () => {
    expect(formatJobDate(null, 'he')).toBe('טרם נקבע');
    expect(formatJobDate(null, 'en')).toBe('To be scheduled');
  });

  it('formats a scheduled date in Asia/Jerusalem', () => {
    const out = formatJobDate('2026-11-13T12:30:00Z', 'en');
    expect(out).toContain('13 November 2026');
    expect(out).toContain('14:30');
  });

  it('formats minor units as currency and dashes a missing price', () => {
    expect(formatJobPrice(52000, 'ILS', 'en')).toContain('520');
    expect(formatJobPrice(null, 'ILS', 'en')).toBe('—');
  });
});

describe('canSignJobContract (authenticated path)', () => {
  const jobAccountId = 'acc-1';

  it('allows a member of the job account', () => {
    expect(canSignJobContract({ roles: ['account_holder'], memberAccountIds: ['acc-9', 'acc-1'], jobAccountId })).toBe(true);
  });

  it('allows tenant admins and super admins regardless of membership', () => {
    expect(canSignJobContract({ roles: ['tenant_admin'], memberAccountIds: [], jobAccountId })).toBe(true);
    expect(canSignJobContract({ roles: ['super_admin'], memberAccountIds: [], jobAccountId })).toBe(true);
  });

  it('rejects another tenant user who merely knows the UUIDs', () => {
    expect(canSignJobContract({ roles: ['account_holder'], memberAccountIds: ['acc-2'], jobAccountId })).toBe(false);
    expect(canSignJobContract({ roles: ['adult_student'], memberAccountIds: [], jobAccountId })).toBe(false);
    expect(canSignJobContract({ roles: [], memberAccountIds: [], jobAccountId })).toBe(false);
  });

  it('rejects non-admins when the job has no account', () => {
    expect(canSignJobContract({ roles: ['account_holder'], memberAccountIds: ['acc-1'], jobAccountId: null })).toBe(false);
  });
});

describe('contract {{price}} (resolveJobContractPrice / loadJobContractPrice)', () => {
  const offering = { price_minor: 0, currency: 'ILS' };

  it('uses the accepted quote total first', () => {
    expect(
      resolveJobContractPrice({
        acceptedQuote: { total_minor: 225000, currency: 'ILS' },
        paymentRequests: [{ amount_minor: 1, currency: 'ILS', status: 'pending' }],
        offering,
      }),
    ).toEqual({ priceMinor: 225000, currency: 'ILS', source: 'quote' });
  });

  it('else sums the non-cancelled payment requests', () => {
    expect(
      resolveJobContractPrice({
        acceptedQuote: null,
        paymentRequests: [
          { amount_minor: 67500, currency: 'ILS', status: 'paid' },
          { amount_minor: 157500, currency: 'ILS', status: 'pending' },
          { amount_minor: 99999, currency: 'ILS', status: 'cancelled' },
        ],
        offering,
      }),
    ).toEqual({ priceMinor: 225000, currency: 'ILS', source: 'payment_requests' });
  });

  it('else falls back to the package price', () => {
    expect(
      resolveJobContractPrice({ acceptedQuote: null, paymentRequests: [], offering: { price_minor: 52000, currency: 'ILS' } }),
    ).toEqual({ priceMinor: 52000, currency: 'ILS', source: 'offering' });
  });

  it('reports no price when nothing is known', () => {
    expect(resolveJobContractPrice({ acceptedQuote: null, paymentRequests: [], offering: null }).source).toBe('none');
  });

  /** Minimal query-builder fake: per-table rows, records the filters applied. */
  function fakeClient(tables: Record<string, { data?: unknown[]; error?: { message: string } }>) {
    const filters: Record<string, string[]> = {};
    const client: PriceQueryClient = {
      from(table) {
        filters[table] = [];
        const result = { data: tables[table]?.data ?? [], error: tables[table]?.error ?? null };
        const builder = {
          eq: (c: string, v: string) => (filters[table].push(`${c}=${v}`), builder),
          neq: (c: string, v: string) => (filters[table].push(`${c}!=${v}`), builder),
          limit: () => builder,
          then: <T,>(ok: (r: typeof result) => T) => Promise.resolve(result).then(ok),
        };
        return { select: () => ({ eq: builder.eq }) };
      },
    };
    return { client, filters };
  }

  const params = { tenantId: 't1', engagementId: 'e1', offering };

  it('loader: accepted quote wins, filtered by tenant, job and status', async () => {
    const { client, filters } = fakeClient({
      quotes: { data: [{ total_minor: 300000, currency: 'ILS' }] },
      job_payment_requests: { data: [{ amount_minor: 5, currency: 'ILS', status: 'pending' }] },
    });
    await expect(loadJobContractPrice(client, params)).resolves.toMatchObject({ priceMinor: 300000, source: 'quote' });
    expect(filters.quotes).toEqual(['tenant_id=t1', 'engagement_id=e1', 'status=accepted']);
    expect(filters.job_payment_requests).toContain('status!=cancelled');
  });

  it('loader: payment requests when there is no accepted quote', async () => {
    const { client } = fakeClient({
      job_payment_requests: { data: [{ amount_minor: 10000, currency: 'ILS', status: 'sent' }] },
    });
    await expect(loadJobContractPrice(client, params)).resolves.toMatchObject({ priceMinor: 10000, source: 'payment_requests' });
  });

  it('loader: package price when quotes/requests are missing or their tables are not migrated', async () => {
    const { client } = fakeClient({
      quotes: { error: { message: 'relation "quotes" does not exist' } },
      job_payment_requests: { error: { message: 'relation does not exist' } },
    });
    await expect(
      loadJobContractPrice(client, { ...params, offering: { price_minor: 52000, currency: 'ILS' } }),
    ).resolves.toMatchObject({ priceMinor: 52000, source: 'offering' });
  });
});
