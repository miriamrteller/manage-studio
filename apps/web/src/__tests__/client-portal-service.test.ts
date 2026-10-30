import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clientContractSignPath,
  decideClientContractLink,
} from '../../../../supabase/functions/_shared/jobs/client-contract-link.ts';

const rows = vi.hoisted(() => ({
  views: [] as Record<string, unknown>[],
  engagements: [] as Record<string, unknown>[],
  calls: [] as { table: string; filters: unknown[] }[],
}));

vi.mock('@/lib/supabase', () => {
  const builder = (table: string) => {
    const call = { table, filters: [] as unknown[] };
    rows.calls.push(call);
    const q = {
      select: (cols: string) => {
        call.filters.push(['select', cols]);
        return q;
      },
      eq: (c: string, v: unknown) => {
        call.filters.push(['eq', c, v]);
        return q;
      },
      in: (c: string, v: unknown) => {
        call.filters.push(['in', c, v]);
        return q;
      },
      order: () => q,
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: table === 'client_job_details' ? rows.views : rows.engagements, error: null }),
    };
    return q;
  };
  return { supabase: { from: builder, rpc: vi.fn(), functions: { invoke: vi.fn() } } };
});

import { ClientPortalService, sortShoots, type ClientShoot } from '@/features/jobs/services/clientPortalService';

const TENANT = 't-1';
const ME = 'person-me';
const MY_ACCOUNT = 'acct-me';

beforeEach(() => {
  rows.calls = [];
  rows.views = [
    { engagement_id: 'e-mine', job_status: 'booked', location: 'Beach', gallery_released: false },
    { engagement_id: 'e-partner', job_status: 'delivered', location: null, gallery_released: true },
    { engagement_id: 'e-other', job_status: 'booked', location: 'Elsewhere', gallery_released: false },
  ];
  rows.engagements = [
    { id: 'e-mine', person_id: ME, status: 'active', booked_starts_at: '2030-01-01T10:00:00Z', booked_ends_at: null, waiver_evidence_id: null, offerings: { name: 'Gold', location: 'Studio' }, people: { account_id: MY_ACCOUNT } },
    { id: 'e-partner', person_id: 'person-partner', status: 'active', booked_starts_at: '2020-01-01T10:00:00Z', booked_ends_at: null, waiver_evidence_id: 'ev-1', offerings: { name: 'Silver', location: 'Studio' }, people: { account_id: MY_ACCOUNT } },
    // Visible to a login that is also a tenant admin, but not this client's.
    { id: 'e-other', person_id: 'person-other', status: 'active', booked_starts_at: null, booked_ends_at: null, waiver_evidence_id: null, offerings: { name: 'Gold', location: null }, people: { account_id: 'acct-other' } },
  ];
});

describe('ClientPortalService.listShoots', () => {
  it('reads the client-safe view (never job_details) and keeps only the client\'s own shoots', async () => {
    const shoots = await ClientPortalService.listShoots(TENANT, { personId: ME, accountId: MY_ACCOUNT });
    expect(rows.calls.map((c) => c.table)).toEqual(['client_job_details', 'engagements']);
    expect(rows.calls.some((c) => c.table === 'job_details')).toBe(false);
    const viewSelect = rows.calls[0].filters.find((f) => (f as unknown[])[0] === 'select') as unknown[];
    expect(String(viewSelect[1])).not.toMatch(/gallery_url|notes/);

    expect(shoots.map((s) => s.engagementId)).toEqual(['e-mine', 'e-partner']);
    expect(shoots[0]).toMatchObject({ packageName: 'Gold', location: 'Beach', contractSigned: false, jobStatus: 'booked' });
    expect(shoots[1]).toMatchObject({ location: 'Studio', contractSigned: true, galleryReleased: true });
  });

  it('without an account only the person\'s own shoots count', async () => {
    const shoots = await ClientPortalService.listShoots(TENANT, { personId: ME, accountId: null });
    expect(shoots.map((s) => s.engagementId)).toEqual(['e-mine']);
  });
});

describe('sortShoots', () => {
  const s = (id: string, at: string | null) => ({ engagementId: id, bookedStartsAt: at }) as ClientShoot;
  it('upcoming soonest first, then undated, then past most recent first', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const out = sortShoots(
      [s('past-old', '2025-01-01T00:00:00Z'), s('undated', null), s('later', '2026-09-01T00:00:00Z'), s('past-new', '2026-05-01T00:00:00Z'), s('soon', '2026-06-02T00:00:00Z')],
      now,
    );
    expect(out.map((x) => x.engagementId)).toEqual(['soon', 'later', 'undated', 'past-new', 'past-old']);
  });
});

describe('decideClientContractLink (edge: client-job-contract-link)', () => {
  const job = {
    tenantId: TENANT,
    personId: ME,
    accountId: MY_ACCOUNT,
    clientEmail: ' Pat@Example.com ',
    waiverEvidenceId: null,
    engagementStatus: 'active',
    jobStatus: 'booked',
  };
  const caller = { callerTenantId: TENANT, callerPersonId: null, callerAccountIds: [MY_ACCOUNT], hasActiveTemplate: true };

  it('lets the client (account member or the person) sign their own job, for the job\'s client email', () => {
    expect(decideClientContractLink({ ...caller, job })).toEqual({ ok: true, email: 'pat@example.com' });
    expect(decideClientContractLink({ ...caller, callerAccountIds: [], callerPersonId: ME, job })).toEqual({
      ok: true,
      email: 'pat@example.com',
    });
  });

  it('hides other clients\' jobs and other tenants\' jobs as not found', () => {
    expect(decideClientContractLink({ ...caller, callerAccountIds: ['acct-other'], job })).toMatchObject({ ok: false, status: 404 });
    expect(decideClientContractLink({ ...caller, callerTenantId: 't-2', job })).toMatchObject({ ok: false, status: 404 });
    expect(decideClientContractLink({ ...caller, job: null })).toMatchObject({ ok: false, status: 404 });
    // A job with no account is only the person's.
    expect(decideClientContractLink({ ...caller, job: { ...job, accountId: null } })).toMatchObject({ ok: false, status: 404 });
  });

  it('refuses signed, cancelled, template-less and email-less jobs', () => {
    expect(decideClientContractLink({ ...caller, job: { ...job, waiverEvidenceId: 'ev' } })).toMatchObject({ status: 409 });
    expect(decideClientContractLink({ ...caller, job: { ...job, jobStatus: 'cancelled' } })).toMatchObject({ status: 409 });
    expect(decideClientContractLink({ ...caller, job: { ...job, engagementStatus: 'cancelled' } })).toMatchObject({ status: 409 });
    expect(decideClientContractLink({ ...caller, hasActiveTemplate: false, job })).toMatchObject({ status: 409 });
    expect(decideClientContractLink({ ...caller, job: { ...job, clientEmail: null } })).toMatchObject({ status: 409 });
  });

  it('builds an app-relative /enrol/complete link', () => {
    expect(clientContractSignPath('e 1', 'a.b+c')).toBe('/enrol/complete?engagementId=e%201&wt=a.b%2Bc');
  });
});
