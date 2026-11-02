// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import en from '@/i18n/en.json';
import he from '@/i18n/he.json';

const sendProblemReport = vi.fn();
vi.mock('@/lib/monitoring', async (orig) => ({
  ...(await orig<typeof import('@/lib/monitoring')>()),
  sendProblemReport: (m: string, f?: File | null) => sendProblemReport(m, f),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      const raw = key.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown> | undefined)?.[p], en);
      const text = typeof raw === 'string' ? raw : key;
      return text.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(vars?.[name] ?? ''));
    },
    i18n: { language: 'en' },
  }),
}));

import { ReportProblemDialog } from '../components/ReportProblem/ReportProblemDialog';

const rp = en.report_problem;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function png(name = 'screen.png', size = 16): File {
  const data = new Uint8Array(size);
  data.set(PNG);
  return new File([data], name, { type: 'image/png' });
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => {
  cleanup();
  sendProblemReport.mockReset();
});

const input = () => screen.getByLabelText(rp.screenshot_button) as HTMLInputElement;
const pick = (f: File) => fireEvent.change(input(), { target: { files: [f] } });

describe('Report a problem: attach a screenshot', () => {
  it('has a labelled file input restricted to PNG, JPG and WebP, and the privacy warning', () => {
    render(<ReportProblemDialog isOpen onClose={() => {}} />);
    expect(input().type).toBe('file');
    expect(input().accept).toBe('image/png,image/jpeg,image/webp');
    const warning = screen.getByText(rp.screenshot_warning);
    expect(warning.textContent).toBe("Screenshots may show students' details. Only attach one if it helps.");
    expect(input().getAttribute('aria-describedby')).toContain(warning.id);
  });

  it('shows the chosen file name and sends the file with the report', async () => {
    sendProblemReport.mockResolvedValue('evt1');
    render(<ReportProblemDialog isOpen onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'Save did nothing' } });
    const file = png('my-screen.png');
    pick(file);
    expect(await screen.findByText('Attached: my-screen.png')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: rp.submit }));
    await waitFor(() => expect(screen.getByText(rp.sent)).toBeTruthy());
    expect(sendProblemReport).toHaveBeenCalledWith('Save did nothing', file);
  });

  it('sends no file when none was chosen', async () => {
    sendProblemReport.mockResolvedValue('evt1');
    render(<ReportProblemDialog isOpen onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: rp.submit }));
    await waitFor(() => expect(sendProblemReport).toHaveBeenCalled());
    expect(sendProblemReport.mock.calls[0][1]).toBeNull();
  });

  it('lets the admin remove the screenshot, and returns focus to the file control', async () => {
    render(<ReportProblemDialog isOpen onClose={() => {}} />);
    pick(png('my-screen.png'));
    const remove = await screen.findByRole('button', { name: 'Remove screenshot my-screen.png' });
    fireEvent.click(remove);
    expect(screen.queryByText('Attached: my-screen.png')).toBeNull();
    expect(document.activeElement).toBe(input());
  });

  it('announces an error for a wrong file type and attaches nothing', async () => {
    render(<ReportProblemDialog isOpen onClose={() => {}} />);
    pick(new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' }));
    const alert = await screen.findByText(rp.screenshot_error_type);
    expect(alert.getAttribute('role')).toBe('alert');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(input().getAttribute('aria-describedby')).toContain(alert.id);
    expect(screen.queryByText(/Attached:/)).toBeNull();
  });

  it('announces an error for an image over 5 MB', async () => {
    render(<ReportProblemDialog isOpen onClose={() => {}} />);
    pick(png('huge.png', 5 * 1024 * 1024 + 1));
    expect((await screen.findByText(rp.screenshot_error_size)).getAttribute('role')).toBe('alert');
    expect(screen.queryByText(/Attached:/)).toBeNull();
  });

  it('clears the error once a good image is chosen', async () => {
    render(<ReportProblemDialog isOpen onClose={() => {}} />);
    pick(new File(['x'], 'a.gif', { type: 'image/gif' }));
    await screen.findByText(rp.screenshot_error_type);
    pick(png());
    await screen.findByText('Attached: screen.png');
    expect(screen.queryByText(rp.screenshot_error_type)).toBeNull();
  });
});

describe('screenshot strings', () => {
  it('exist in English and Hebrew with the same placeholders', () => {
    const keys = Object.keys(en.report_problem).filter((k) => k.startsWith('screenshot_'));
    expect(keys.length).toBe(8);
    for (const k of keys) {
      const e = (en.report_problem as Record<string, string>)[k];
      const h = (he.report_problem as Record<string, string>)[k];
      expect(typeof h).toBe('string');
      expect(h.match(/\{\{\w+\}\}/g) ?? []).toEqual(e.match(/\{\{\w+\}\}/g) ?? []);
    }
  });
});
