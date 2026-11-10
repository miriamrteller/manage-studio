// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import en from '@/i18n/en.json';
import he from '@/i18n/he.json';

const sendFeedback = vi.fn();
vi.mock('@/lib/monitoring/sendFeedback', async (orig) => ({
  ...(await orig<typeof import('@/lib/monitoring/sendFeedback')>()),
  sendFeedback: (i: unknown) => sendFeedback(i),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

import { ReportProblemDialog } from '../components/ReportProblem/ReportProblemDialog';
import { canReportProblems } from '../lib/monitoring';

beforeAll(() => {
  // jsdom has no <dialog> methods.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

afterEach(() => {
  cleanup();
  sendFeedback.mockReset();
});

const open = (initialKind: 'bug' | 'idea' | 'help' | null = null) =>
  render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind={initialKind} />);

describe('Send feedback', () => {
  it('shows Bug, Idea and Help at once, and the message box only after one is picked', () => {
    open();
    for (const k of ['bug', 'idea', 'help']) {
      expect(screen.getByRole('radio', { name: `report_problem.kinds.${k}.button` })).toBeTruthy();
    }
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'report_problem.submit' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'report_problem.kinds.idea.button' }));
    expect(screen.getByLabelText(/report_problem.kinds.idea.label/)).toBeTruthy();
  });

  it('starts on Bug when opened from the error screen', () => {
    open('bug');
    expect(screen.getByRole('radio', { name: 'report_problem.kinds.bug.button' })).toBeChecked();
    expect(screen.getByLabelText(/report_problem.kinds.bug.label/)).toBeTruthy();
  });

  it('requires a message before sending', async () => {
    open('bug');
    fireEvent.click(screen.getByRole('button', { name: 'report_problem.submit' }));
    expect(await screen.findByText('report_problem.kinds.bug.required')).toBeTruthy();
    expect(sendFeedback).not.toHaveBeenCalled();
  });

  it('sends the kind, message and studio, and thanks the admin for that kind', async () => {
    sendFeedback.mockResolvedValue(true);
    open();
    fireEvent.click(screen.getByRole('radio', { name: 'report_problem.kinds.help.button' }));
    fireEvent.change(screen.getByLabelText(/report_problem.kinds.help.label/), { target: { value: 'How do I add a room?' } });
    fireEvent.click(screen.getByRole('button', { name: 'report_problem.submit' }));
    await waitFor(() => expect(screen.getByText('report_problem.kinds.help.sent')).toBeTruthy());
    expect(sendFeedback).toHaveBeenCalledWith({ kind: 'help', message: 'How do I add a room?', screenshot: null, tenantId: 't1' });
  });

  it('shows an error when it could not be sent', async () => {
    sendFeedback.mockResolvedValue(false);
    open('idea');
    fireEvent.change(screen.getByLabelText(/report_problem.kinds.idea.label/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'report_problem.submit' }));
    expect(await screen.findByText('report_problem.failed')).toBeTruthy();
  });
});

describe('feedback strings', () => {
  it('exist for every kind in English and Hebrew', () => {
    for (const k of ['bug', 'idea', 'help'] as const) {
      const e = en.report_problem.kinds[k];
      const h = he.report_problem.kinds[k];
      expect(Object.keys(h).sort()).toEqual(Object.keys(e).sort());
      for (const v of Object.values(h)) expect(v).toBeTruthy();
    }
    expect(Object.keys(he.platform_feedback).sort()).toEqual(Object.keys(en.platform_feedback).sort());
  });
});

describe('canReportProblems', () => {
  it('is limited to admins of a studio, with or without Sentry', () => {
    expect(canReportProblems(['tenant_admin'], 't1')).toBe(true);
    expect(canReportProblems(['super_admin'], 't1')).toBe(true);
    expect(canReportProblems(['super_admin'], null)).toBe(false);
    expect(canReportProblems(['parent'], 't1')).toBe(false);
    expect(canReportProblems(['student', 'teacher'], 't1')).toBe(false);
    expect(canReportProblems(undefined, 't1')).toBe(false);
  });
});
