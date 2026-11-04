// @vitest-environment jsdom
/**
 * "Fun setup": the wizard counts as done, studio levels with a gem, a cheer per
 * ticked row, a time estimate on the next step ("2 to go" near the end), three
 * once-per-studio celebrations (reduced-motion safe, never steal focus, close
 * with a button or Esc, never close by themselves) and "Fewer celebrations".
 * Run: pnpm -C apps/web test setup-fun.test.tsx
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  celebrations: {} as unknown,
  updates: [] as unknown[],
}));

vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't1', vertical: 'generic', payment_provider: 'offline' }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: { celebrations: h.celebrations }, error: null });
      chain.update = (row: unknown) => {
        h.updates.push(row);
        return { eq: async () => ({ error: null }) };
      };
      return chain;
    },
  },
}));

import i18n from '@/i18n/i18n';
import { CELEBRATION_MOMENTS, funProgress, levelFor, nextCelebration, parseCelebrations, reachedMoments } from '@/features/setup-guide/lib/setupFun';
import { buildSetupRows, EMPTY_FACTS, setupProgress } from '@/features/setup-guide/lib/setupChecklist';
import { CelebrationBanner, SetupGuideCard, useCelebrations } from '@/features/setup-guide';
import type { SetupGuide } from '@/features/setup-guide/hooks/useSetupGuide';

function guideFor(facts = EMPTY_FACTS, skipped: string[] = []): SetupGuide {
  const rows = buildSetupRows('generic', facts);
  return {
    rows,
    facts,
    skipped,
    progress: setupProgress(rows, skipped),
    closed: false,
    visible: true,
    isLoading: false,
    skip: vi.fn(),
    unskip: vi.fn(),
    close: vi.fn(),
    reopen: vi.fn(),
  };
}

function wrap(node: ReactNode) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{node}</MemoryRouter>
    </I18nextProvider>,
  );
}

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as never;
}

beforeEach(() => {
  window.localStorage.clear();
  h.celebrations = {};
  h.updates = [];
});
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await i18n.changeLanguage('en');
});

describe('progress and levels', () => {
  it('counts the set-up wizard as done', () => {
    const fun = funProgress(setupProgress(buildSetupRows('generic', EMPTY_FACTS), []));
    expect([fun.done, fun.total, fun.percent]).toEqual([1, 6, 17]);
    expect(fun.level).toBe('getting_started');
  });

  it('Getting started → Open for enquiries → Ready for clients → Fully set up', () => {
    expect(levelFor(20, false)).toBe('getting_started');
    expect(levelFor(40, false)).toBe('open_for_enquiries');
    expect(levelFor(80, false)).toBe('ready_for_clients');
    expect(levelFor(80, true)).toBe('fully_set_up');
  });
});

describe('celebrations: once per studio', () => {
  it('an existing studio is not congratulated on what it already did', () => {
    const { celebrate, next } = nextCelebration(parseCelebrations({}), ['first_enquiry'], 'now');
    expect(celebrate).toBeNull();
    expect(next).toMatchObject({ since: 'now', fired: { first_enquiry: 'now' } });
  });

  it('a new moment is celebrated once, then never again', () => {
    const state = parseCelebrations({ since: 'then', fired: {} });
    const first = nextCelebration(state, reachedMoments({ setupComplete: false, leads: 1, paidClients: 0 }), 'now');
    expect(first.celebrate).toBe('first_enquiry');
    expect(nextCelebration(first.next!, ['first_enquiry'], 'later')).toEqual({ celebrate: null, next: null });
    expect(CELEBRATION_MOMENTS).toEqual(['setup_done', 'first_enquiry', 'first_paid']);
  });

  it('the hook stores the moment on the studio and shows it until dismissed', async () => {
    h.celebrations = { since: '2026-11-01T00:00:00Z', fired: {} };
    const client = new QueryClient();
    const { result } = renderHook(() => useCelebrations({ ready: true, setupComplete: false, leads: 0, paidClients: 1 }), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(result.current.active).toBe('first_paid'));
    expect(h.updates[0]).toMatchObject({ celebrations: { fired: { first_paid: expect.any(String) } } });
    act(() => result.current.dismiss());
    expect(result.current.active).toBeNull();
    act(() => result.current.setFewer(true));
    expect(result.current.fewer).toBe(true);
    expect(h.updates.at(-1)).toMatchObject({ celebrations: { fewer: true } });
  });
});

describe('the checklist card', () => {
  it('the next step has a time estimate, and near the end how many are left', () => {
    const facts = { ...EMPTY_FACTS, hasLogo: true, offerings: 1, paymentsReady: true, legalPublished: true };
    wrap(<SetupGuideCard guide={guideFor(facts)} />);
    expect(screen.getByRole('link', { name: /Next: .*About 2 minutes · 1 to go/ })).toBeInTheDocument();
    expect(screen.getByText('Level: Ready for clients')).toBeInTheDocument();
  });

  it('a row that ticks itself gets a short cheer (not with Fewer celebrations)', () => {
    window.localStorage.setItem('setup-guide-done:t1', JSON.stringify([]));
    wrap(<SetupGuideCard guide={guideFor({ ...EMPTY_FACTS, hasLogo: true })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Looking good! Your studio is starting to look like yours.');
    cleanup();
    window.localStorage.setItem('setup-guide-done:t1', JSON.stringify([]));
    wrap(<SetupGuideCard guide={guideFor({ ...EMPTY_FACTS, hasLogo: true })} fewer onFewerChange={() => {}} />);
    expect(screen.queryByText(/Looking good/)).toBeNull();
  });

  it('the first visit on a device does not cheer old ticks', () => {
    wrap(<SetupGuideCard guide={guideFor({ ...EMPTY_FACTS, hasLogo: true })} />);
    expect(screen.queryByText(/Looking good/)).toBeNull();
  });

  it('"Fewer celebrations" is a plain, labelled choice', () => {
    const onFewer = vi.fn();
    wrap(<SetupGuideCard guide={guideFor()} onFewerChange={onFewer} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fewer celebrations' }));
    expect(onFewer).toHaveBeenCalledWith(true);
  });

  it('when everything is done: "Your studio is live", with the share link', () => {
    const facts = { ...EMPTY_FACTS, hasLogo: true, offerings: 1, paymentsReady: true, legalPublished: true, leads: 1 };
    wrap(<SetupGuideCard guide={guideFor(facts)} />);
    expect(screen.getByText(/Your studio is live!/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Share your link' })).toHaveAttribute('href', '/admin/leads/get');
  });

  it('is in Hebrew too', async () => {
    await i18n.changeLanguage('he');
    wrap(<SetupGuideCard guide={guideFor()} onFewerChange={() => {}} />);
    expect(screen.getByText('שלב: מתחילים')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'פחות חגיגות' })).toBeInTheDocument();
  });
});

describe('the celebration message', () => {
  it('reduced motion: a still gem, no confetti; decorations are hidden from screen readers', () => {
    setReducedMotion(true);
    wrap(<CelebrationBanner moment="setup_done" fewer={false} onDismiss={() => {}} />);
    expect(screen.queryByTestId('celebration-confetti')).toBeNull();
    expect(screen.getByTestId('celebration-still')).toHaveAttribute('aria-hidden', 'true');
  });

  it('with motion: one fall of confetti, hidden from screen readers; none with Fewer celebrations', () => {
    setReducedMotion(false);
    wrap(<CelebrationBanner moment="first_enquiry" fewer={false} onDismiss={() => {}} />);
    expect(screen.getByTestId('celebration-confetti')).toHaveAttribute('aria-hidden', 'true');
    cleanup();
    wrap(<CelebrationBanner moment="first_enquiry" fewer onDismiss={() => {}} />);
    expect(screen.queryByTestId('celebration-confetti')).toBeNull();
  });

  it('is announced politely, never takes focus, never closes by itself, closes with its button or Esc', () => {
    vi.useFakeTimers();
    setReducedMotion(true);
    const onDismiss = vi.fn();
    wrap(<CelebrationBanner moment="setup_done" fewer={false} onDismiss={onDismiss} />);
    expect(screen.getByRole('status')).toHaveTextContent('Your studio is live!');
    expect(document.activeElement).toBe(document.body);
    act(() => vi.advanceTimersByTime(60_000));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Share your link' })).toHaveAttribute('href', '/admin/leads/get');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
