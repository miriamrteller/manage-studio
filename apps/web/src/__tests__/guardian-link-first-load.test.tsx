// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  calls: [] as string[],
  resolveQueue: [] as unknown[],
  linkResult: 0 as number | Error,
}));

vi.mock('@/features/enrolment/lib/resolveGuardianProfile', async (orig) => ({
  ...(await orig<typeof import('@/features/enrolment/lib/resolveGuardianProfile')>()),
  resolveGuardianProfile: vi.fn(async () => {
    h.calls.push('resolve');
    return h.resolveQueue.shift();
  }),
}));

vi.mock('@/features/enrolment/linkAuthUser', () => ({
  linkMyGuardianAccounts: vi.fn(async () => {
    h.calls.push('link');
    if (h.linkResult instanceof Error) throw h.linkResult;
    return h.linkResult;
  }),
}));

import { NoFamilyAccountError } from '@/features/enrolment/lib/resolveGuardianProfile';
import { resolveGuardianWithLink } from '@/features/enrolment/lib/resolveGuardianWithLink';

const input = { tenant: { id: 't1' } as never, userProfileId: 'u1', userEmail: 'a@b.test', userPersonId: null };
const found = { status: 'found', profile: { personId: 'p1' } };
const missing = () => ({ status: 'missing_account', error: new NoFamilyAccountError() });

beforeEach(() => {
  h.calls = [];
  h.resolveQueue = [];
  h.linkResult = 0;
});

describe('resolveGuardianWithLink: the first-load order', () => {
  it('does not call the link when the family is already linked', async () => {
    h.resolveQueue = [found];
    expect(await resolveGuardianWithLink(input)).toBe(found);
    expect(h.calls).toEqual(['resolve']);
  });

  it('looks up, links once, then looks up again and finds the family', async () => {
    h.resolveQueue = [missing(), found];
    h.linkResult = 1;
    expect(await resolveGuardianWithLink(input)).toBe(found);
    expect(h.calls).toEqual(['resolve', 'link', 'resolve']);
  });

  it('gives up with the "no family account" result when the link finds nothing', async () => {
    const first = missing();
    h.resolveQueue = [first];
    h.linkResult = 0;
    expect(await resolveGuardianWithLink(input)).toBe(first);
    expect(h.calls).toEqual(['resolve', 'link']);
  });

  it('still returns the original result when the link call itself fails', async () => {
    const first = missing();
    h.resolveQueue = [first];
    h.linkResult = new Error('network');
    expect(await resolveGuardianWithLink(input)).toBe(first);
    expect(h.calls).toEqual(['resolve', 'link']);
  });

  it('does not try to link for other kinds of failure (e.g. the account lookup itself failed)', async () => {
    const failed = { status: 'missing_account', error: new Error('Failed to load account: boom') };
    h.resolveQueue = [failed];
    expect(await resolveGuardianWithLink(input)).toBe(failed);
    expect(h.calls).toEqual(['resolve']);
  });
});

// ── useParentPortal ─────────────────────────────────────────────────────────
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { id: 'u1', email: 'a@b.test', person_id: null } }),
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't1', subdomain: 'ballet' }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import { useParentPortal } from '@/components/Dashboard/useParentPortal';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useParentPortal', () => {
  it('reports "no family account" without retrying, after trying the link once', async () => {
    h.resolveQueue = [missing(), missing()];
    h.linkResult = 0;
    const { result } = renderHook(() => useParentPortal(), { wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error).toBeInstanceOf(NoFamilyAccountError);
    expect(h.calls).toEqual(['resolve', 'link']);
  });
});

import { isExpectedError } from '@/lib/query-client';

describe('monitoring', () => {
  it('does not report "no family account" to Sentry as an error', () => {
    expect(isExpectedError(new NoFamilyAccountError())).toBe(true);
    expect(isExpectedError(new Error('Failed to load account: boom'))).toBe(false);
  });
});
