// @vitest-environment jsdom
/**
 * "Get leads" (2c-i): tagged links per channel, QR code, the poster PDF file
 * format, and the panel (copy / open / share, downloads, embed steps, lead email).
 * Run: pnpm -C apps/web test get-leads-panel
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  downloadBlob: vi.fn(),
  qrPng: vi.fn(async () => new Blob(['png'])),
  posterPdf: vi.fn(async () => new Blob(['pdf'])),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => {
      if (o?.returnObjects) return [`${k}.1`, `${k}.2`];
      if (o && 'lng' in o) return `${k}@${o.lng}`;
      return o && Object.keys(o).length ? `${k}(${Object.values(o).join(',')})` : k;
    },
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({
    id: 't-1',
    name: 'Creative Ballet',
    subdomain: 'creativeballet',
    logo_url: 'https://cdn.example.test/logo.png',
    white_label: { primary_color: '#5B6CFF' },
  }),
}));
vi.mock('@/features/crm/lib/qr', async (orig) => ({
  ...(await orig<typeof import('@/features/crm/lib/qr')>()),
  downloadBlob: h.downloadBlob,
  qrPng: h.qrPng,
}));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/features/crm/lib/poster', async (orig) => ({
  ...(await orig<typeof import('@/features/crm/lib/poster')>()),
  posterPdf: h.posterPdf,
}));

import { GetLeadsPanel } from '@/features/crm/components/GetLeadsPanel';
import { loadFirstLeads } from '@/features/crm/lib/firstLeads';
import { composeHref, fileSlug, formLink, SHARE_CHANNELS } from '@/features/crm/lib/shareTargets';
import { qrMatrix, qrSvgPath } from '@/features/crm/lib/qr';
import { jpegPdf } from '@/features/crm/lib/poster';
import { WEBSITE_PLATFORMS, WEBSITE_STEPS } from '@shared/index';
import { channelFromSrc } from '../../../../supabase/functions/_shared/crm-contract/lead-ingest-core.ts';

const origin = 'https://creativeballet.opalswift.com';
const writeText = vi.fn(async () => undefined);

beforeEach(() => {
  vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, origin } });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  delete (navigator as { share?: unknown }).share;
});

describe('links', () => {
  it('builds the form link, tagged per channel, for any form target', () => {
    expect(formLink(origin, { path: '/inquire' })).toBe(`${origin}/inquire`);
    expect(formLink(origin, { path: '/inquire' }, 'instagram')).toBe(`${origin}/inquire?src=instagram`);
    expect(formLink(origin, { path: '/f/grade2' }, 'flyer')).toBe(`${origin}/f/grade2?src=flyer`);
  });

  it('every shared channel tag lands as its own lead source', () => {
    for (const channel of SHARE_CHANNELS) expect(channelFromSrc(channel)).toBe(channel);
  });

  it('opens WhatsApp, email and SMS with the link filled in; others are copy-only', () => {
    const link = `${origin}/inquire?src=whatsapp`;
    expect(composeHref('whatsapp', link, 'Hi')).toBe(`https://wa.me/?text=${encodeURIComponent(`Hi ${link}`)}`);
    expect(composeHref('email', link, 'Hi')).toMatch(/^mailto:\?subject=Hi&body=/);
    expect(composeHref('sms', link, 'Hi')).toMatch(/^sms:\?&body=/);
    expect(composeHref('instagram', link, 'Hi')).toBeNull();
    expect(composeHref('flyer', link, 'Hi')).toBeNull();
  });

  it('file names are safe', () => {
    expect(fileSlug('Creative Ballet!')).toBe('creative-ballet');
    expect(fileSlug('בלט')).toBe('enquiry-form');
  });
});

describe('QR code', () => {
  it('is a square matrix with the three finder patterns', () => {
    const m = qrMatrix(`${origin}/inquire?src=flyer`);
    const n = m.length;
    expect(n).toBeGreaterThanOrEqual(21);
    m.forEach((row) => expect(row).toHaveLength(n));
    // Each finder pattern: a dark 7×7 ring with a dark 3×3 centre.
    for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      expect(m[r][c]).toBe(true);
      expect(m[r + 1][c + 1]).toBe(false);
      expect(m[r + 3][c + 3]).toBe(true);
    }
    const svg = qrSvgPath(m);
    expect(svg.size).toBe(n + 8);
    expect(svg.d.length).toBeGreaterThan(0);
  });
});

describe('poster PDF', () => {
  it('is a valid one-page PDF whose cross-reference offsets point at each object', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = new Uint8Array(await jpegPdf(jpeg, 1240, 1754).arrayBuffer());
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Type /Page ');
    expect(text).toContain('/Width 1240 /Height 1754');
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const offsets = [...text.slice(startxref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((off, i) => expect(text.slice(off, off + 8)).toBe(`${i + 1} 0 obj\n`));
  });
});

describe('GetLeadsPanel', () => {
  const renderPanel = () =>
    render(
      <MemoryRouter>
        <GetLeadsPanel />
      </MemoryRouter>,
    );

  it('shows the hosted form link first and copies it', async () => {
    renderPanel();
    expect((screen.getByLabelText('pages.crm.get_leads.form_link') as HTMLInputElement).value).toBe(`${origin}/inquire`);
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.get_leads.copy_link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${origin}/inquire`));
    // ...and ticks "Share your enquiry form link" on the Leads page checklist.
    expect(loadFirstLeads('t-1').done).toContain('share_link');
  });

  it('copies a tagged link for each channel and shows how to use it', async () => {
    renderPanel();
    for (const channel of SHARE_CHANNELS) {
      expect(screen.getByText(`pages.crm.get_leads.howto_${channel}`)).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.get_leads.copy_for(pages.crm.leads.channel_instagram)' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${origin}/inquire?src=instagram`));
  });

  it('offers Share only where the phone supports it', () => {
    const { unmount } = renderPanel();
    expect(screen.queryByRole('button', { name: 'pages.crm.get_leads.share' })).toBeNull();
    unmount();
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.get_leads.share' }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: `${origin}/inquire` }));
  });

  it('downloads the QR (flyer-tagged) and a poster with the studio name, logo and colour', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.get_leads.download_qr' }));
    await waitFor(() => expect(h.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'creativeballet-qr.png'));
    expect(h.qrPng).toHaveBeenCalledWith(`${origin}/inquire?src=flyer`);

    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.get_leads.download_poster' }));
    await waitFor(() => expect(h.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'creativeballet-poster.pdf'));
    expect(h.posterPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        studioName: 'Creative Ballet',
        url: `${origin}/inquire?src=flyer`,
        logoUrl: 'https://cdn.example.test/logo.png',
        colour: '#5B6CFF',
        scanLine: 'pages.crm.get_leads.scan_to_enquire@en',
        scanLineOther: 'pages.crm.get_leads.scan_to_enquire@he',
        dir: 'ltr',
      }),
    );
  });

  it('keeps embedding in a collapsed section with steps per website builder, and explains the lead email', () => {
    renderPanel();
    const details = screen.getByText('pages.crm.get_leads.website_title').closest('details')!;
    expect(details.open).toBe(false);
    for (const p of WEBSITE_PLATFORMS) {
      expect(screen.getByText(WEBSITE_STEPS.en[p][0])).toBeTruthy();
    }
    expect(screen.getByLabelText('pages.crm.get_leads.instructions_title')).toBeTruthy();
    expect(screen.getByText('leads-creativeballet@opalswift.com')).toBeTruthy();
    expect(screen.getByText('pages.crm.get_leads.email_hint')).toBeTruthy();
  });
});
