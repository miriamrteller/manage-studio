// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const sendProblemReport = vi.fn();
vi.mock('@/lib/monitoring', async (orig) => ({
  ...(await orig<typeof import('@/lib/monitoring')>()),
  sendProblemReport: (m: string) => sendProblemReport(m),
}));
const notifyOwner = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/monitoring/notifyOwner', () => ({
  notifyOwnerOfProblemReport: (m: string, id: string | null) => notifyOwner(m, id),
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
  sendProblemReport.mockReset();
  notifyOwner.mockReset();
  notifyOwner.mockResolvedValue(undefined);
});

describe('ReportProblemDialog', () => {
  it('requires a message before sending', async () => {
    render(<ReportProblemDialog isOpen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'report_problem.submit' }));
    expect(await screen.findByText('report_problem.required')).toBeTruthy();
    expect(screen.getByLabelText(/report_problem.label/).getAttribute('aria-invalid')).toBe('true');
    expect(sendProblemReport).not.toHaveBeenCalled();
  });

  it('sends the message and shows a confirmation', async () => {
    sendProblemReport.mockResolvedValue('evt1');
    render(<ReportProblemDialog isOpen onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/report_problem.label/), { target: { value: 'Save did nothing' } });
    fireEvent.click(screen.getByRole('button', { name: 'report_problem.submit' }));
    await waitFor(() => expect(screen.getByText('report_problem.sent')).toBeTruthy());
    expect(sendProblemReport).toHaveBeenCalledWith('Save did nothing');
    expect(notifyOwner).toHaveBeenCalledWith('Save did nothing', 'evt1');
  });

  it('a failing owner email never changes the result the admin sees', async () => {
    sendProblemReport.mockResolvedValue('evt1');
    notifyOwner.mockRejectedValue(new Error('email down'));
    render(<ReportProblemDialog isOpen onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/report_problem.label/), { target: { value: 'Save did nothing' } });
    fireEvent.click(screen.getByRole('button', { name: 'report_problem.submit' }));
    await waitFor(() => expect(screen.getByText('report_problem.sent')).toBeTruthy());
  });

  it('shows an error when the report could not be sent', async () => {
    sendProblemReport.mockResolvedValue(null);
    render(<ReportProblemDialog isOpen onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/report_problem.label/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'report_problem.submit' }));
    expect(await screen.findByText('report_problem.failed')).toBeTruthy();
    expect(notifyOwner).not.toHaveBeenCalled();
  });
});

describe('canReportProblems', () => {
  it('is off without a DSN, whatever the role', () => {
    expect(canReportProblems(['tenant_admin'])).toBe(false);
  });

  it('is limited to studio admins when a DSN is configured', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://k@o1.ingest.de.sentry.io/1');
    vi.resetModules();
    const m = await import('../lib/monitoring');
    expect(m.canReportProblems(['tenant_admin'])).toBe(true);
    expect(m.canReportProblems(['super_admin'])).toBe(true);
    expect(m.canReportProblems(['parent'])).toBe(false);
    expect(m.canReportProblems(['student', 'teacher'])).toBe(false);
    expect(m.canReportProblems(undefined)).toBe(false);
    vi.unstubAllEnvs();
  });
});
