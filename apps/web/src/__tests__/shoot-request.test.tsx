// @vitest-environment jsdom
/**
 * Photographer shoot requests: the Book page sends a package + day (nothing
 * charged), busy Google Calendar days are greyed out, the studio's alert
 * carries the package, the day and a Confirm link, and the leads list labels
 * the request and opens Confirm from that link.
 * Run: pnpm -C apps/web test shoot-request
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import type { ReactElement } from 'react';

const h = vi.hoisted(() => ({
  vertical: 'photographer',
  invoke: vi.fn(async (..._args: unknown[]): Promise<{ data: unknown; error: unknown }> => ({
    data: { outcome: 'created' },
    error: null,
  })),
  busy: [] as Array<{ start: string; end: string }>,
}));

vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't1', name: 'Lens Studio', subdomain: 'lens', vertical: h.vertical }),
}));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: null, isLoading: false, isProfileChecked: true }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: h.invoke } } }));
vi.mock('@/components/PrivacyNotice', () => ({ PrivacyNotice: () => null }));
vi.mock('@/features/scheduling/bookingService', () => ({
  BookingService: {
    listBookableOfferings: async () => [
      { id: 'pkg-1', name: 'Family shoot', duration_mins: 60, price_minor: 90000, currency: 'ILS', location: null },
      { id: 'pkg-2', name: 'Newborn shoot', duration_mins: 120, price_minor: 120000, currency: 'ILS', location: null },
    ],
    getCalendarBusy: async () => h.busy,
  },
}));
vi.mock('@/features/scheduling/hooks/useIsNarrowViewport', () => ({ useIsNarrowViewport: () => true }));

vi.mock('../../../../supabase/functions/_shared/email-client.ts', () => ({
  sendHtmlEmail: vi.fn(async () => ({ id: 'email-1' })),
}));

import i18n from '@/i18n/i18n';
import BookingPage from '@/pages/BookingPage';
import { busyDaysFrom, studioToday } from '@/features/scheduling/lib/busyDays';
import { isShootRequest } from '@/features/crm/components/LeadsList';
import { sendHtmlEmail } from '../../../../supabase/functions/_shared/email-client.ts';
import {
  formatRequestDay,
  notifyTenantOfLead,
  shootRequestConfirmUrl,
} from '../../../../supabase/functions/_shared/crm-contract/lead-ingest-core.ts';

function renderAt(ui: ReactElement, path = '/book') {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/book" element={ui} />
            <Route path="/book/:offeringId" element={ui} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

afterEach(() => {
  cleanup();
  h.vertical = 'photographer';
  h.busy = [];
  h.invoke.mockClear();
  vi.unstubAllEnvs();
});

describe('busyDaysFrom', () => {
  it('greys a day with 4+ busy hours in the working day, not one with a short appointment', () => {
    const days = busyDaysFrom([
      // 09:00–14:00 Israel time (UTC+2 in December): taken.
      { start: '2026-12-03T07:00:00Z', end: '2026-12-03T12:00:00Z' },
      // A one-hour appointment: still free.
      { start: '2026-12-04T08:00:00Z', end: '2026-12-04T09:00:00Z' },
      // All night: outside 08:00–20:00, so still free.
      { start: '2026-12-05T19:00:00Z', end: '2026-12-06T05:00:00Z' },
    ]);
    expect([...days]).toEqual(['2026-12-03']);
  });

  it('counts overlapping busy times once and handles all-day blocks', () => {
    const days = busyDaysFrom([
      { start: '2026-12-10T08:00:00Z', end: '2026-12-10T10:00:00Z' },
      { start: '2026-12-10T09:00:00Z', end: '2026-12-10T10:00:00Z' },
      { start: '2026-12-11T00:00:00Z', end: '2026-12-12T00:00:00Z' },
    ]);
    expect(days.has('2026-12-10')).toBe(false);
    expect(days.has('2026-12-11')).toBe(true);
  });
});

describe('photographer Book page', () => {
  it('shows packages and a day picker, never time slots, and sends a request without charging', async () => {
    renderAt(<BookingPage />);
    expect(await screen.findByRole('heading', { name: 'Request a shoot' })).toBeInTheDocument();
    expect(screen.queryByText('Choose a time')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Newborn shoot/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    const day15 = await screen.findAllByRole('button', { name: /15/ });
    fireEvent.click(day15[0]);
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Dana' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dana@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
    const [fn, { body }] = h.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(fn).toBe('crm-lead-capture');
    expect(body.tenantSubdomain).toBe('lens');
    expect(body.shootRequest).toEqual({ offeringId: 'pkg-2', date: expect.stringMatching(/^\d{4}-\d{2}-15$/) });
    expect(await screen.findByRole('heading', { name: 'Request sent' })).toBeInTheDocument();
    expect(screen.getByRole('status').textContent).toMatch(/Nothing has been charged/);
  });

  it('a day the Google Calendar shows as busy cannot be picked', async () => {
    const today = studioToday();
    const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    h.busy = [{ start: `${next}-20T00:00:00Z`, end: `${next}-21T00:00:00Z` }];
    renderAt(<BookingPage />);
    await screen.findByRole('heading', { name: 'Request a shoot' });
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    const taken = await screen.findByRole('button', { name: /, Taken$/ });
    expect(taken).toBeDisabled();
    expect(taken.textContent).toBe('20');
  });

  it('a package in the link starts selected', async () => {
    renderAt(<BookingPage />, '/book/pkg-2');
    const pkg = await screen.findByRole('button', { name: /Newborn shoot/ });
    expect(pkg).toHaveAttribute('aria-pressed', 'true');
  });

  it('appointment businesses keep instant booking', async () => {
    h.vertical = 'dance-studio';
    renderAt(<BookingPage />);
    expect(await screen.findByText('Choose a service')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Request a shoot' })).toBeNull();
  });
});

describe('shoot request alert to the studio', () => {
  const tenant = {
    id: 't-1',
    name: 'Lens Studio',
    subdomain: 'lens',
    language_default: 'en',
    contact_email: 'studio@example.test',
    from_email: null,
    from_email_verified_at: null,
  };
  const fields = { name: 'Dana', email: 'dana@example.test', phone: null, interest: 'Family shoot', lastCommunicationNote: null };
  const service = { from: () => ({ insert: async () => ({ error: null }) }) } as never;

  it('carries the package, the day and a Confirm link to the lead', async () => {
    vi.stubEnv('APP_ROOT_DOMAIN', 'opalswift.com');
    vi.mocked(sendHtmlEmail).mockClear();
    await notifyTenantOfLead(service, tenant, fields, 'created', { leadId: 'lead-9', packageName: 'Family shoot', date: '2026-12-04' });
    const mail = vi.mocked(sendHtmlEmail).mock.calls[0][0] as { subject: string; html: string; to: string };
    expect(mail.to).toBe('studio@example.test');
    expect(mail.subject).toBe('Shoot request: Dana, Friday, 4 December 2026');
    expect(mail.html).toContain('Nothing has been charged');
    expect(mail.html).toContain('Family shoot');
    expect(mail.html).toContain('href="https://lens.opalswift.com/admin/leads?lead=lead-9&amp;confirm=1"');
    expect(shootRequestConfirmUrl(tenant, 'lead-9')).toBe('https://lens.opalswift.com/admin/leads?lead=lead-9&confirm=1');
  });

  it('still sends the alert when no link can be built', async () => {
    vi.stubEnv('APP_ROOT_DOMAIN', '');
    vi.stubEnv('APP_URL', '');
    vi.mocked(sendHtmlEmail).mockClear();
    await notifyTenantOfLead(service, tenant, fields, 'created', { leadId: 'lead-9', packageName: null, date: '2026-12-04' });
    const mail = vi.mocked(sendHtmlEmail).mock.calls[0][0] as { html: string };
    expect(mail.html).not.toContain('href=');
  });

  it('writes the day in Hebrew for Hebrew studios', () => {
    expect(formatRequestDay('2026-12-04', true)).toContain('4');
    expect(formatRequestDay('2026-12-04', true)).toMatch(/דצמבר/);
  });
});

describe('isShootRequest', () => {
  it('needs a package and a day, and not yet confirmed', () => {
    expect(isShootRequest({ offering_id: 'p', event_date: '2026-12-04', converted_account_id: null })).toBe(true);
    expect(isShootRequest({ offering_id: null, event_date: '2026-12-04', converted_account_id: null })).toBe(false);
    expect(isShootRequest({ offering_id: 'p', event_date: '2026-12-04', converted_account_id: 'a' })).toBe(false);
  });
});
