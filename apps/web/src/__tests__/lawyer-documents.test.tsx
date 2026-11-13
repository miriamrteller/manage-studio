// @vitest-environment jsdom
/**
 * Legal pack, part 2: lawyer-reviewed versions. Statuses per document, what the
 * acknowledgement covers as drafts, and the upload / revert actions.
 * Run: pnpm -C apps/web test lawyer-documents.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
  uploads: [] as Array<Record<string, unknown>>,
  forms: [] as Array<{ lawyer_reviewed_at: string | null }>,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: h.rpc,
    storage: { from: () => ({ upload: h.upload, download: vi.fn() }) },
    from: () => {
      const q = { select: () => q, eq: () => q, then: (r: (v: unknown) => unknown) => r({ data: h.forms, error: null }) };
      return q;
    },
  },
}));

import i18n from '@/i18n/i18n';
import { LawyerDocumentsList } from '@/components/legal/LawyerDocumentsList';
import {
  draftDocuments,
  packDocumentStatus,
  packDocumentsFor,
  type LawyerDocument,
} from '@/legal/lawyerDocuments';
import type { TenantLegalProfile } from '@/legal/useLegalDocument';

const upload = (document: LawyerDocument['document']): LawyerDocument => ({
  document,
  language: 'he',
  kind: 'text',
  content: 'Lawyer text',
  storagePath: null,
  fileName: null,
  uploadedAt: '2026-11-02T10:00:00Z',
});

const legal = (over: Partial<TenantLegalProfile> = {}): TenantLegalProfile => ({
  tenantId: 't-1',
  name: 'Harbour Dance',
  contactEmail: 'office@harbour.test',
  vertical: 'dance-studio',
  skin: 'dance-studio',
  profile: {},
  published: true,
  updatedAt: null,
  packRequired: true,
  packAcknowledgedAt: null,
  languageDefault: 'he',
  packAckDrafts: [],
  ...over,
});

describe('statuses', () => {
  it('photographers have no enrolment terms; every studio has its signed forms', () => {
    expect(packDocumentsFor('dance-studio')).toEqual(['studio-privacy', 'enrolment-terms', 'accessibility', 'cookies', 'signed-forms']);
    expect(packDocumentsFor('photographer')).toEqual(['studio-privacy', 'accessibility', 'cookies', 'signed-forms']);
  });

  it('reviewed (with its date), acknowledged draft, or draft to confirm', () => {
    const acked = legal({ packAcknowledgedAt: '2026-11-02T11:00:00Z', packAckDrafts: ['cookies', 'signed-forms'] });
    expect(packDocumentStatus('studio-privacy', acked, [upload('studio-privacy')], null)).toEqual({
      kind: 'reviewed',
      date: '2026-11-02T10:00:00Z',
    });
    expect(packDocumentStatus('cookies', acked, [], null)).toEqual({ kind: 'acknowledged-draft' });
    // Reviewed when acknowledged, then reverted: a draft to confirm again.
    expect(packDocumentStatus('accessibility', acked, [], null)).toEqual({ kind: 'draft' });
    expect(packDocumentStatus('cookies', legal(), [], null)).toEqual({ kind: 'draft' });
    // Studios from before the legal pack are never asked.
    expect(packDocumentStatus('cookies', legal({ packRequired: false }), [], null)).toEqual({ kind: 'acknowledged-draft' });
  });

  it('the signed forms count as reviewed only when every active form is marked', () => {
    const l = legal();
    expect(packDocumentStatus('signed-forms', l, [], { activeCount: 2, reviewedCount: 1, reviewedAt: null }).kind).toBe('draft');
    expect(
      packDocumentStatus('signed-forms', l, [], { activeCount: 2, reviewedCount: 2, reviewedAt: '2026-11-02T09:00:00Z' }),
    ).toEqual({ kind: 'reviewed', date: '2026-11-02T09:00:00Z' });
  });

  it('the drafts are everything not yet lawyer-reviewed', () => {
    const docs = packDocumentsFor('dance-studio');
    expect(draftDocuments(docs, [upload('cookies')], { activeCount: 1, reviewedCount: 1, reviewedAt: 'x' })).toEqual([
      'studio-privacy',
      'enrolment-terms',
      'accessibility',
    ]);
  });
});

function renderList(l: TenantLegalProfile) {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <LawyerDocumentsList legal={l} />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  h.uploads = [];
  h.forms = [{ lawyer_reviewed_at: null }];
  h.upload.mockResolvedValue({ data: { path: 'x' }, error: null });
  h.rpc.mockImplementation(async (name: string) => {
    if (name === 'get_tenant_legal_documents') return { data: h.uploads, error: null };
    if (name === 'revert_tenant_legal_document') return { data: true, error: null };
    return { data: null, error: null };
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('the documents list', () => {
  it('shows each document with its status; the forms point to the Forms editor', async () => {
    h.uploads = [{ document: 'studio-privacy', language: 'he', kind: 'pdf', storage_path: 't-1/studio-privacy/a.pdf', file_name: 'privacy.pdf', uploaded_at: '2026-11-02T10:00:00Z' }];
    renderList(legal({ packAcknowledgedAt: '2026-11-02T11:00:00Z', packAckDrafts: ['enrolment-terms', 'accessibility', 'cookies', 'signed-forms'] }));
    expect(await screen.findByText(/Lawyer-reviewed \(uploaded 2 Nov 2026\)/)).toBeInTheDocument();
    expect(screen.getByTestId('status-cookies')).toHaveTextContent('Draft (acknowledged)');
    expect(screen.getByRole('link', { name: 'Open the Forms editor' })).toHaveAttribute('href', '/admin/settings/waivers');
  });

  it('uploads a PDF into the studio\'s folder, then records it', async () => {
    renderList(legal());
    const inputs = await screen.findAllByLabelText('Upload PDF');
    const file = new File(['%PDF-1.4'], 'privacy.pdf', { type: 'application/pdf' });
    fireEvent.change(inputs[0], { target: { files: [file] } });
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('save_tenant_legal_document', expect.objectContaining({
      p_document: 'studio-privacy',
      p_language: 'he',
      p_kind: 'pdf',
      p_file_name: 'privacy.pdf',
    })));
    const path = h.upload.mock.calls[0][0] as string;
    expect(path).toMatch(/^t-1\/studio-privacy\/.+\.pdf$/);
    expect(await screen.findByText('Saved. Your clients now see the lawyer-reviewed version.')).toBeInTheDocument();
  });

  it('refuses a file that is not a PDF', async () => {
    renderList(legal());
    const inputs = await screen.findAllByLabelText('Upload PDF');
    fireEvent.change(inputs[0], { target: { files: [new File(['x'], 'notes.docx', { type: 'application/msword' })] } });
    expect(await screen.findByText('Please choose a PDF file.')).toBeInTheDocument();
    expect(h.upload).not.toHaveBeenCalled();
  });

  const paste = (el: HTMLElement, text: string) =>
    fireEvent.paste(el, { clipboardData: { getData: () => text } });

  it('saves pasted text in the chosen language', async () => {
    renderList(legal());
    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit the text' }))[1]);
    const editor = screen.getByRole('textbox', { name: "Your lawyer's text" });
    // It starts from the current draft; the lawyer's text replaces it.
    await waitFor(() => expect(editor.textContent).not.toBe(''));
    editor.replaceChildren();
    fireEvent.input(editor);
    paste(editor, '# Terms\n\nReviewed.');
    fireEvent.click(screen.getByRole('button', { name: 'Save this version' }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('save_tenant_legal_document', {
        p_document: 'enrolment-terms',
        p_language: 'he',
        p_kind: 'text',
        p_content: '# Terms\n\nReviewed.',
      }),
    );
  });

  it('starts from the draft with the studio details as live fields (chips), saved as tokens', async () => {
    renderList(legal());
    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit the text' }))[0]);
    const editor = screen.getByRole('textbox', { name: "Your lawyer's text" });
    await waitFor(() => expect(editor.querySelector('[data-detail]')).not.toBeNull());
    const chip = editor.querySelector<HTMLElement>('[data-detail]')!;
    expect(chip.getAttribute('contenteditable')).toBe('false');
    expect(chip).toHaveAttribute('aria-label');
    fireEvent.click(screen.getByRole('button', { name: 'Save this version' }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('save_tenant_legal_document', expect.anything()));
    const call = h.rpc.mock.calls.find((c: unknown[]) => c[0] === 'save_tenant_legal_document')!;
    expect((call[1] as { p_content: string }).p_content).toMatch(/\{\{detail:[a-z_]+\}\}/);
  });

  it('pasted text: today’s detail values become live fields again', async () => {
    renderList(legal());
    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit the text' }))[1]);
    const editor = screen.getByRole('textbox', { name: "Your lawyer's text" });
    await waitFor(() => expect(editor.textContent).not.toBe(''));
    editor.replaceChildren();
    fireEvent.input(editor);
    paste(editor, `Run by ${legal().name}.`);
    expect(editor.querySelector('[data-detail="studio_name"]')).not.toBeNull();
  });

  it('going back to the template says when the pack must be confirmed again', async () => {
    h.uploads = [{ document: 'cookies', language: 'en', kind: 'text', content: 'x', uploaded_at: '2026-11-02T10:00:00Z' }];
    renderList(legal({ packAcknowledgedAt: '2026-11-02T11:00:00Z', packAckDrafts: [] }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back to the template' }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('revert_tenant_legal_document', { p_document: 'cookies' }));
    expect(await screen.findByText(/please confirm your legal documents again/)).toBeInTheDocument();
  });

  it('works in Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderList(legal());
    expect((await screen.findAllByText('טיוטה (עדיין לא אושרה)')).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('העלאת PDF').length).toBe(4);
  });
});
