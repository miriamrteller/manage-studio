// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const svc = vi.hoisted(() => ({ fetch: vi.fn(), setStatus: vi.fn(), url: vi.fn() }));
vi.mock('@/features/platform/services/feedbackAdminService', async (orig) => ({
  ...(await orig<typeof import('@/features/platform/services/feedbackAdminService')>()),
  fetchFeedback: () => svc.fetch(),
  setFeedbackStatus: (id: string, s: string) => svc.setStatus(id, s),
  screenshotUrl: (p: string) => svc.url(p),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars?.count !== undefined ? `${key}:${vars.count}` : key),
    i18n: { language: 'en' },
  }),
}));

import { FeedbackInbox } from '../features/platform/components/FeedbackInbox';

const base = {
  route: '/admin/classes',
  screenshot_path: null,
  status: 'new',
  created_at: '2026-11-10T09:00:00Z',
  studio_name: 'Test Studio',
  subdomain: 'teststudio',
  industry: 'Dance studio',
  sender_email: 'owner@studio.test',
};
const ITEMS = [
  { ...base, id: 'a', kind: 'bug', message: 'Save does nothing' },
  { ...base, id: 'b', kind: 'idea', message: 'Let clients swap a class', screenshot_path: 't/x.png' },
];

function renderInbox() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FeedbackInbox />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Platform > Feedback', () => {
  it('lists every message with the studio, industry and sender', async () => {
    svc.fetch.mockResolvedValue(ITEMS);
    renderInbox();
    expect(await screen.findByText('Save does nothing')).toBeTruthy();
    expect(screen.getByText('Let clients swap a class')).toBeTruthy();
    expect(screen.getAllByText('Dance studio')).toHaveLength(2);
    expect(screen.getAllByText('owner@studio.test')).toHaveLength(2);
    expect(screen.getByText('platform_feedback.count:2')).toBeTruthy();
  });

  it('filters by type', async () => {
    svc.fetch.mockResolvedValue(ITEMS);
    renderInbox();
    await screen.findByText('Save does nothing');
    fireEvent.change(screen.getByLabelText('platform_feedback.filter_kind'), { target: { value: 'idea' } });
    expect(screen.queryByText('Save does nothing')).toBeNull();
    expect(screen.getByText('Let clients swap a class')).toBeTruthy();
  });

  it('changes the status of one message', async () => {
    svc.fetch.mockResolvedValue(ITEMS);
    svc.setStatus.mockResolvedValue(undefined);
    renderInbox();
    const card = (await screen.findByText('Save does nothing')).closest('li')!;
    fireEvent.change(within(card).getByLabelText('platform_feedback.status_for'), { target: { value: 'planned' } });
    await waitFor(() => expect(svc.setStatus).toHaveBeenCalledWith('a', 'planned'));
  });

  it('offers the screenshot only when there is one', async () => {
    svc.fetch.mockResolvedValue(ITEMS);
    renderInbox();
    await screen.findByText('Save does nothing');
    expect(screen.getAllByRole('button', { name: 'platform_feedback.screenshot' })).toHaveLength(1);
  });
});
