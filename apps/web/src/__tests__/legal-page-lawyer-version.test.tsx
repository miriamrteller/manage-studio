// @vitest-environment jsdom
/**
 * /legal/:doc shows the studio's lawyer-reviewed version instead of the
 * generated draft: its text (HTML escaped) or a button that opens its PDF.
 * Run: pnpm -C apps/web test legal-page-lawyer-version.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({ uploads: [] as unknown[] }));

vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't-1' }) }));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: null }) }));
vi.mock('@/legal/lawyerDocuments', () => ({
  useLawyerDocuments: () => ({ data: h.uploads, isLoading: false }),
  lawyerPdfUrl: vi.fn(),
}));
vi.mock('@/legal/useLegalDocument', async (orig) => {
  const actual = await orig<typeof import('@/legal/useLegalDocument')>();
  return {
    ...actual,
    useLegalDocument: () => ({
      doc: { markdown: '# Generated draft', missing: [], missingLabels: [], version: 'v' },
      lang: 'en',
      legal: {
        tenantId: 't-1', name: 'Harbour', contactEmail: 'o@x.test', vertical: 'dance-studio', profile: {},
        published: true, updatedAt: null, packRequired: true, packAcknowledgedAt: '2026-11-02T10:00:00Z',
        languageDefault: 'he', packAckDrafts: [],
      },
      isLoading: false,
      error: null,
    }),
  };
});

import i18n from '@/i18n/i18n';
import LegalPage from '@/pages/LegalPage';

function renderPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/legal/cookies']}>
        <Routes>
          <Route path="/legal/:doc" element={<LegalPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  h.uploads = [];
});

describe('legal page: lawyer-reviewed version', () => {
  it('without one, the generated draft', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Generated draft' })).toBeInTheDocument();
  });

  it('the lawyer\'s text replaces the draft, in its own language; HTML stays text', () => {
    h.uploads = [{
      document: 'cookies', language: 'he', kind: 'text',
      content: '# מדיניות עוגיות\n\n<script>alert(1)</script>', storagePath: null, fileName: null,
      uploadedAt: '2026-11-02T10:00:00Z',
    }];
    const { container } = renderPage();
    expect(screen.queryByText('Generated draft')).toBeNull();
    expect(screen.getByRole('heading', { name: 'מדיניות עוגיות' }).closest('article')).toHaveAttribute('lang', 'he');
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/lawyer-reviewed version, uploaded 2 Nov 2026/)).toBeInTheDocument();
  });

  it('a PDF opens from a button', () => {
    h.uploads = [{
      document: 'cookies', language: 'en', kind: 'pdf', content: null,
      storagePath: 't-1/cookies/a.pdf', fileName: 'cookies.pdf', uploadedAt: '2026-11-02T10:00:00Z',
    }];
    renderPage();
    expect(screen.getByRole('button', { name: 'Open the document (cookies.pdf)' })).toBeInTheDocument();
  });
});
