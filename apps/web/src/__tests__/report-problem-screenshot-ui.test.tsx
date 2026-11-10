// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import en from '@/i18n/en.json';
import he from '@/i18n/he.json';

const sendProblemReport = vi.fn();
const snap = vi.hoisted(() => ({ capture: vi.fn(), pending: null as null | ((f: File) => void) }));
vi.mock('@/lib/monitoring/pageSnapshot', () => ({ capturePageSnapshot: () => snap.capture() }));
// The editor has its own tests; here it is a stand-in with Done and Cancel.
vi.mock('@/components/ReportProblem/ScreenshotRedactor', () => ({
  ScreenshotRedactor: ({ file, onDone, onCancel }: { file: File; onDone: (f: File) => void; onCancel: () => void }) => (
    <div data-testid="redactor-stub">
      <span>editing {file.name}</span>
      <button type="button" onClick={() => onDone(new File(['burned'], 'screenshot.png', { type: 'image/png' }))}>stub done</button>
      <button type="button" onClick={onCancel}>stub cancel</button>
    </div>
  ),
}));
// The dialog sends through sendFeedback; record the message and screenshot it was given.
vi.mock('@/lib/monitoring/sendFeedback', async (orig) => ({
  ...(await orig<typeof import('@/lib/monitoring/sendFeedback')>()),
  sendFeedback: (i: { message: string; screenshot?: File | null }) => sendProblemReport(i.message, i.screenshot ?? null),
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
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
    expect(input().type).toBe('file');
    expect(input().accept).toBe('image/png,image/jpeg,image/webp');
    const warning = screen.getByText(rp.screenshot_warning);
    expect(warning.textContent).toBe("Screenshots may show students' details. Only attach one if it helps.");
    expect(input().getAttribute('aria-describedby')).toContain(warning.id);
  });

  it('shows the chosen file name and sends the file with the report', async () => {
    sendProblemReport.mockResolvedValue('evt1');
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
    fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'Save did nothing' } });
    const file = png('my-screen.png');
    pick(file);
    expect(await screen.findByText('Attached: my-screen.png')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: rp.submit }));
    await waitFor(() => expect(screen.getByText(rp.kinds.bug.sent)).toBeTruthy());
    expect(sendProblemReport).toHaveBeenCalledWith('Save did nothing', file);
  });

  it('sends no file when none was chosen', async () => {
    sendProblemReport.mockResolvedValue('evt1');
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
    fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: rp.submit }));
    await waitFor(() => expect(sendProblemReport).toHaveBeenCalled());
    expect(sendProblemReport.mock.calls[0][1]).toBeNull();
  });

  it('lets the admin remove the screenshot, and returns focus to the file control', async () => {
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
    pick(png('my-screen.png'));
    const remove = await screen.findByRole('button', { name: 'Remove screenshot my-screen.png' });
    fireEvent.click(remove);
    expect(screen.queryByText('Attached: my-screen.png')).toBeNull();
    expect(document.activeElement).toBe(input());
  });

  it('announces an error for a wrong file type and attaches nothing', async () => {
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
    pick(new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' }));
    const alert = await screen.findByText(rp.screenshot_error_type);
    expect(alert.getAttribute('role')).toBe('alert');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(input().getAttribute('aria-describedby')).toContain(alert.id);
    expect(screen.queryByText(/Attached:/)).toBeNull();
  });

  it('announces an error for an image over 5 MB', async () => {
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
    pick(png('huge.png', 5 * 1024 * 1024 + 1));
    expect((await screen.findByText(rp.screenshot_error_size)).getAttribute('role')).toBe('alert');
    expect(screen.queryByText(/Attached:/)).toBeNull();
  });

  it('clears the error once a good image is chosen', async () => {
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
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


describe('Snapshot with text hidden', () => {
  const snapshotFile = () => png('screenshot.png', 64);

  afterEach(() => {
    snap.capture.mockReset();
  });

  it('is an optional button with its explanation, and needs no attached image', () => {
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
    const button = screen.getByRole('button', { name: rp.snapshot_button });
    expect(button.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(button.getAttribute('aria-describedby') as string)?.textContent).toBe(rp.snapshot_hint);
    expect(screen.queryByRole('button', { name: rp.redact_button })).toBeNull();
  });

  it('attaches the snapshot and sends it with the report', async () => {
    sendProblemReport.mockResolvedValue('evt1');
    const file = snapshotFile();
    snap.capture.mockResolvedValue(file);
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
    fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'Looks wrong' } });
    fireEvent.click(screen.getByRole('button', { name: rp.snapshot_button }));
    expect(await screen.findByText('Attached: screenshot.png')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: rp.submit }));
    await waitFor(() => expect(sendProblemReport).toHaveBeenCalled());
    expect(sendProblemReport).toHaveBeenCalledWith('Looks wrong', file);
  });

  it('is disabled while the snapshot is being taken', async () => {
    let finish: (f: File) => void = () => undefined;
    snap.capture.mockReturnValue(new Promise<File>((resolve) => { finish = resolve; }));
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
    fireEvent.click(screen.getByRole('button', { name: rp.snapshot_button }));
    const busy = await screen.findByRole('button', { name: rp.snapshot_busy });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    finish(snapshotFile());
    await screen.findByText('Attached: screenshot.png');
  });

  it('says so, and attaches nothing, when the browser cannot take it', async () => {
    snap.capture.mockRejectedValue(Object.assign(new Error('x'), { code: 'failed' }));
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
    fireEvent.click(screen.getByRole('button', { name: rp.snapshot_button }));
    const alert = await screen.findByText(rp.snapshot_error_failed);
    expect(alert.getAttribute('role')).toBe('alert');
    expect(screen.queryByText(/Attached:/)).toBeNull();
  });

  it('says so when the page is too large', async () => {
    snap.capture.mockRejectedValue(Object.assign(new Error('x'), { code: 'too_large' }));
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
    fireEvent.click(screen.getByRole('button', { name: rp.snapshot_button }));
    expect(await screen.findByText(rp.snapshot_error_too_large)).toBeTruthy();
  });

  it('a text-only report is unchanged: no snapshot is taken and no file is sent', async () => {
    sendProblemReport.mockResolvedValue('evt1');
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
    fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'Just words' } });
    fireEvent.click(screen.getByRole('button', { name: rp.submit }));
    await waitFor(() => expect(sendProblemReport).toHaveBeenCalledWith('Just words', null));
    expect(snap.capture).not.toHaveBeenCalled();
  });
});

describe('Hide details', () => {
  it('appears only once an image is attached, and opens the editor in place of the form', async () => {
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
    expect(screen.queryByRole('button', { name: rp.redact_button })).toBeNull();
    pick(png('my-screen.png'));
    fireEvent.click(await screen.findByRole('button', { name: rp.redact_button }));
    expect(await screen.findByTestId('redactor-stub')).toBeTruthy();
    expect(screen.getByText('editing my-screen.png')).toBeTruthy();
    expect(screen.queryByLabelText(/What happened/)).toBeNull();
  });

  it('keeps what was typed, replaces the image with the edited one, and returns focus to the button', async () => {
    sendProblemReport.mockResolvedValue('evt1');
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
    fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'Typed words' } });
    pick(png('my-screen.png'));
    fireEvent.click(await screen.findByRole('button', { name: rp.redact_button }));
    fireEvent.click(await screen.findByText('stub done'));
    expect(await screen.findByText('Attached: screenshot.png')).toBeTruthy();
    expect((screen.getByLabelText(/What happened/) as HTMLTextAreaElement).value).toBe('Typed words');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: rp.redact_button })));
    fireEvent.click(screen.getByRole('button', { name: rp.submit }));
    await waitFor(() => expect(sendProblemReport).toHaveBeenCalled());
    const sent = sendProblemReport.mock.calls[0][1] as File;
    expect(sent.name).toBe('screenshot.png');
    expect(sent.size).toBe(6); // 'burned', not the original image
  });

  it('Cancel keeps the original image', async () => {
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
    pick(png('my-screen.png'));
    fireEvent.click(await screen.findByRole('button', { name: rp.redact_button }));
    fireEvent.click(await screen.findByText('stub cancel'));
    expect(await screen.findByText('Attached: my-screen.png')).toBeTruthy();
  });

  it('skipping it sends the image exactly as attached', async () => {
    sendProblemReport.mockResolvedValue('evt1');
    render(<ReportProblemDialog isOpen onClose={() => {}} tenantId="t1" initialKind="bug" />);
    fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'x' } });
    const file = png('my-screen.png');
    pick(file);
    await screen.findByText('Attached: my-screen.png');
    fireEvent.click(screen.getByRole('button', { name: rp.submit }));
    await waitFor(() => expect(sendProblemReport).toHaveBeenCalledWith('x', file));
  });
});

describe('snapshot and hide-details strings', () => {
  it('exist in English and Hebrew with the same placeholders', () => {
    const keys = Object.keys(en.report_problem).filter((k) => k.startsWith('snapshot_') || k.startsWith('redact_'));
    expect(keys.length).toBeGreaterThanOrEqual(21);
    for (const k of keys) {
      const e = (en.report_problem as Record<string, string>)[k];
      const h = (he.report_problem as Record<string, string>)[k];
      expect(typeof h, k).toBe('string');
      expect(h.match(/\{\{\w+\}\}/g) ?? [], k).toEqual(e.match(/\{\{\w+\}\}/g) ?? []);
    }
  });
});
