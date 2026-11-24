// @vitest-environment jsdom
/**
 * Ask OpalSwift panel: asks, shows the answer and its guides, "Fill it in for me"
 * opens the form with the details (the admin still saves), "Show me how" starts the
 * tour, and the daily limit has its own message. Read-only: it never saves anything.
 * Run: pnpm -C apps/web test assistant-panel
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { AskResult } from '@/features/assistant/askAssistant';
import type { AssistantExchange } from '@/features/assistant/AssistantContext';

const askAssistant = vi.fn<(input: unknown) => Promise<AskResult>>();
vi.mock('@/features/assistant/askAssistant', () => ({ askAssistant: (input: unknown) => askAssistant(input) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o && 'count' in o ? `${k}:${String(o.count)}` : k),
    i18n: { language: 'en' },
  }),
}));

import { AssistantPanel, prefillTarget } from '@/features/assistant/AssistantPanel';

function Where() {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname} ${JSON.stringify(location.state)}`}</output>;
}

function Harness({ onShowMe }: { onShowMe: (id: string) => void }) {
  const [exchanges, setExchanges] = useState<AssistantExchange[]>([]);
  return (
    <MemoryRouter initialEntries={['/admin']}>
      <AssistantPanel
        isOpen
        onOpen={() => {}}
        onClose={() => {}}
        exchanges={exchanges}
        setExchanges={setExchanges}
        onShowMe={onShowMe}
      />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

function ask(text: string) {
  fireEvent.change(screen.getByLabelText('assistant.question_label'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'assistant.ask' }));
}

describe('Ask OpalSwift panel', () => {
  beforeEach(() => askAssistant.mockReset());

  it('shows the answer with its guides, fills the form in and starts the tour', async () => {
    askAssistant.mockResolvedValue({
      ok: true,
      remaining: 19,
      reply: {
        answer: 'Open Shoots and press New shoot.',
        guideIds: ['new_shoot'],
        showMe: 'new_shoot',
        unknown: false,
        unknownReason: null,
        prefill: { kind: 'new_shoot', clientName: 'Dana', startsAt: '2026-12-01T10:00' },
      },
    });
    const onShowMe = vi.fn();
    render(<Harness onShowMe={onShowMe} />);
    ask('How do I add a shoot for Dana on 1 December?');

    expect(await screen.findByText('Open Shoots and press New shoot.')).toBeTruthy();
    expect(askAssistant).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'How do I add a shoot for Dana on 1 December?', language: 'en', route: '/admin', history: [] }),
    );
    expect(screen.getByRole('link', { name: 'help.topics.new_shoot.title' }).getAttribute('href')).toBe('/admin/help#help-new_shoot');
    expect(screen.getByText('assistant.remaining:19')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'assistant.fill_in' }));
    expect(screen.getByTestId('where').textContent).toBe(
      '/admin/projects {"newShoot":{"clientName":"Dana","startsAt":"2026-12-01T10:00"}}',
    );
    expect(screen.getByText('assistant.fill_in_done')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'assistant.show_me' }));
    expect(onShowMe).toHaveBeenCalledWith('new_shoot');
  });

  it('sends earlier answers as history and says when a question was noted for a guide', async () => {
    askAssistant
      .mockResolvedValueOnce({
        ok: true,
        remaining: 19,
        reply: { answer: 'First.', guideIds: [], showMe: null, unknown: false, unknownReason: null, prefill: null },
      })
      .mockResolvedValueOnce({
        ok: true,
        remaining: 18,
        reply: { answer: "I don't know.", guideIds: [], showMe: null, unknown: true, unknownReason: 'missing_guide', prefill: null },
      });
    render(<Harness onShowMe={() => {}} />);
    ask('one');
    await screen.findByText('First.');
    ask('two');
    await screen.findByText('assistant.gap_noted');
    expect(askAssistant).toHaveBeenLastCalledWith(
      expect.objectContaining({ history: [{ role: 'user', text: 'one' }, { role: 'assistant', text: 'First.' }] }),
    );
  });

  it('offers Show me for a question that only asks for information, and opens nothing by itself', async () => {
    askAssistant.mockResolvedValue({
      ok: true,
      remaining: 19,
      reply: { answer: 'Seasons are under Classes.', guideIds: ['seasons'], showMe: null, unknown: false, unknownReason: null, prefill: null },
    });
    const onShowMe = vi.fn();
    render(<Harness onShowMe={onShowMe} />);
    ask('Where are my seasons?');
    await screen.findByText('Seasons are under Classes.');
    expect(screen.getByTestId('where').textContent).toBe('/admin null');
    fireEvent.click(screen.getByRole('button', { name: 'assistant.show_me' }));
    expect(onShowMe).toHaveBeenCalledWith('seasons');
  });

  it('stops asking at the daily limit', async () => {
    askAssistant.mockResolvedValue({ ok: false, code: 'daily_limit' });
    render(<Harness onShowMe={() => {}} />);
    ask('one more');
    expect(await screen.findByText('assistant.errors.daily_limit')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('assistant.question_label'), { target: { value: 'again' } });
    await waitFor(() => expect((screen.getByRole('button', { name: 'assistant.ask' }) as HTMLButtonElement).disabled).toBe(true));
  });

  it('says so when the whole platform has used up today\'s questions', async () => {
    askAssistant.mockResolvedValue({ ok: false, code: 'platform_limit' });
    render(<Harness onShowMe={() => {}} />);
    ask('one');
    expect(await screen.findByText('assistant.errors.platform_limit')).toBeTruthy();
  });

  it('sends a package prefill to Packages', () => {
    expect(prefillTarget({ kind: 'package', name: 'Family', price: '900', durationHours: '1.5' })).toEqual({
      path: '/admin/bookings/packages',
      state: { newPackage: { name: 'Family', price: '900', durationHours: '1.5' } },
    });
  });
});
