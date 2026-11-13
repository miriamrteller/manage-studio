// @vitest-environment jsdom
/**
 * The "Finish setup" checklist: rows per kind of studio, ticking from real data,
 * skipping, closing, and reopening.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import {
  buildSetupRows,
  EMPTY_FACTS,
  setupFlavour,
  setupProgress,
} from '@/features/setup-guide/lib/setupChecklist';

const h = vi.hoisted(() => ({
  tenant: {} as Record<string, unknown>,
  counts: {} as Record<string, number>,
  legalPublished: false,
}));

vi.mock('@/hooks/useTenant', () => ({ useTenant: () => h.tenant }));
vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    const result = { count: h.counts[table] ?? 0, error: null };
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  };
  return {
    supabase: {
      from,
      rpc: async () => ({ data: [{ legal_pages_published: h.legalPublished }], error: null }),
    },
  };
});

import i18n from '@/i18n/i18n';
import { SetupGuideCard, useSetupGuide } from '@/features/setup-guide';

const ids = (v: string) => buildSetupRows(v, EMPTY_FACTS).map((r) => r.id);

describe('setup checklist rows', () => {
  it('has different rows for dance, photographer and everyone else', () => {
    expect(ids('dance-studio')).toEqual(['branding', 'levels', 'season', 'classes', 'payments', 'legal', 'test_enrolment']);
    expect(ids('photographer')).toEqual(['branding', 'packages', 'payments', 'legal', 'leads', 'first_quote']);
    expect(ids('generic')).toEqual(['branding', 'offerings', 'payments', 'legal', 'leads']);
    expect(ids('beautician')).toEqual(ids('generic'));
    expect(setupFlavour(undefined)).toBe('general');
  });

  it('ticks rows from real data', () => {
    const rows = buildSetupRows('dance-studio', { ...EMPTY_FACTS, hasLogo: true, levels: 2, offerings: 1 });
    expect(rows.filter((r) => r.done).map((r) => r.id)).toEqual(['branding', 'levels', 'classes']);
  });

  it('adds "Connect online payments" only for studios on online payment, and ticks it when keys are saved', () => {
    const off = buildSetupRows('generic', { ...EMPTY_FACTS });
    expect(off.map((r) => r.id)).not.toContain('connect_payments');
    const on = buildSetupRows('generic', { ...EMPTY_FACTS, onlinePayments: true, paymentsReady: true });
    expect(on.map((r) => r.id)).toEqual(['branding', 'offerings', 'payments', 'connect_payments', 'legal', 'leads']);
    expect(on.find((r) => r.id === 'connect_payments')?.done).toBe(false);
    const saved = buildSetupRows('generic', { ...EMPTY_FACTS, onlinePayments: true, paymentsReady: true, paymentsConnected: true });
    expect(saved.find((r) => r.id === 'connect_payments')?.done).toBe(true);
  });

  it('counts skipped rows as resolved, and points at the first open row', () => {
    const rows = buildSetupRows('photographer', { ...EMPTY_FACTS, hasLogo: true });
    const p = setupProgress(rows, ['packages']);
    expect(p).toMatchObject({ resolved: 2, total: 6, complete: false });
    expect(p.next?.id).toBe('payments');
    const all = setupProgress(rows, ['packages', 'payments', 'leads', 'first_quote']);
    expect(all.complete).toBe(false);
    expect(all.next?.id).toBe('legal');
  });

  it('the legal row cannot be skipped: going live depends on it', () => {
    const rows = buildSetupRows('photographer', { ...EMPTY_FACTS, hasLogo: true });
    const p = setupProgress(rows, ['packages', 'payments', 'legal', 'leads', 'first_quote']);
    expect(p.complete).toBe(false);
    expect(p.next?.id).toBe('legal');
    const done = setupProgress(buildSetupRows('photographer', { ...EMPTY_FACTS, hasLogo: true, legalPublished: true }), [
      'packages', 'payments', 'leads', 'first_quote',
    ]);
    expect(done.complete).toBe(true);
  });
});

function Harness() {
  const guide = useSetupGuide();
  return (
    <>
      {guide.isLoading ? <p>loading</p> : guide.visible ? <SetupGuideCard guide={guide} /> : <p>hidden</p>}
      <button onClick={guide.reopen}>reopen</button>
    </>
  );
}

function renderHarness() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <Harness />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  h.counts = {};
  h.legalPublished = false;
  h.tenant = { id: 't1', vertical: 'dance-studio', payment_provider: 'offline', offline_payment_instructions: '' };
});

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

describe('SetupGuideCard', () => {
  it('shows progress, the next step as one big link, and ticks from data', async () => {
    h.tenant = { ...h.tenant, logo_url: 'https://x/logo.png' };
    h.counts = { categories: 1 };
    renderHarness();
    // The set-up wizard counts as a step already done: 3 of 8.
    expect(await screen.findByText("You're 38% there")).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '38');
    expect(screen.getByText('Level: Open for enquiries')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Next: Set up your season\s*About 3 minutes$/ })).toHaveAttribute('href', '/admin/classes/seasons');
    expect(screen.getByRole('link', { name: 'hello@opalswift.com' })).toHaveAttribute('href', 'mailto:hello@opalswift.com');
  });

  it('uses "health declaration" for dance, "contract" for photographers, "service agreement" for others', async () => {
    renderHarness();
    expect(await screen.findByText(/legal details and health declaration/)).toBeInTheDocument();
    cleanup();
    h.tenant = { id: 't1', vertical: 'photographer', payment_provider: 'offline' };
    renderHarness();
    expect(await screen.findByText(/legal details and contract/)).toBeInTheDocument();
    cleanup();
    h.tenant = { id: 't1', vertical: 'generic', payment_provider: 'offline' };
    renderHarness();
    expect(await screen.findByText(/legal details and service agreement/)).toBeInTheDocument();
    expect(screen.queryByText(/waiver/i)).toBeNull();
  });

  it('the legal row says the documents are drafts (nobody waits on it) and has no Skip', async () => {
    renderHarness();
    expect(await screen.findByText("Your legal documents are still drafts. Parents can still sign up, sign and pay.")).toBeInTheDocument();
    const legalRow = screen.getByRole('link', { name: /legal details and health declaration/ }).closest('li')!;
    expect(legalRow.querySelector('button')).toBeNull();
  });

  it('a new Grow studio sees "Connect online payments" linking to Settings → Payments', async () => {
    h.tenant = { id: 't1', vertical: 'generic', payment_provider: 'grow', payment_provider_secret_configured: false };
    renderHarness();
    const link = await screen.findByRole('link', { name: /Connect online payments/ });
    expect(link).toHaveAttribute('href', '/admin/settings?tab=payment');
  });

  it('skip and undo update the count; the choice is kept', async () => {
    renderHarness();
    await screen.findByText("You're 13% there");
    fireEvent.click(screen.getAllByRole('button', { name: 'Skip' })[0]);
    expect(screen.getByText("You're 25% there")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('setup-guide:t1')!).skipped).toEqual(['branding']);
    fireEvent.click(screen.getByRole('button', { name: 'Undo skip' }));
    expect(screen.getByText("You're 13% there")).toBeInTheDocument();
  });

  it('close hides it and reopen brings it back, even when everything is done', async () => {
    renderHarness();
    await screen.findByText("You're 13% there");
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText('hidden')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'reopen' }));
    expect(await screen.findByText("You're 13% there")).toBeInTheDocument();
  });

  it('hides itself once every row is done', async () => {
    h.tenant = { ...h.tenant, logo_url: 'x', offline_payment_instructions: 'Cash' };
    h.counts = { categories: 1, seasons: 1, offerings: 1, engagements: 1 };
    h.legalPublished = true;
    renderHarness();
    await waitFor(() => expect(screen.getByText('hidden')).toBeInTheDocument());
  });

  it('is in Hebrew too', async () => {
    await i18n.changeLanguage('he');
    renderHarness();
    expect(await screen.findByText('הגעתם ל-13%')).toBeInTheDocument();
    expect(screen.getByText('שלב: מתחילים')).toBeInTheDocument();
  });
});
