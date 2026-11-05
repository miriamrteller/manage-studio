// @vitest-environment jsdom
/**
 * Embeddable enquiry form (docs/plans/LEADS.md P1-B): the same form on
 * /inquire and /embed/inquire, source + campaign tags, Turnstile, consent kept
 * separate from tags, the Settings snippet, and the frame headers.
 * Run: pnpm -C apps/web test lead-embed-form
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  invoke: vi.fn(async (..._args: unknown[]): Promise<{ data: unknown; error: unknown }> => ({ data: { outcome: 'created' }, error: null })),
}));
// Signed out: the public form starts blank (signed-in prefill: prefill-enrolment.test.tsx).
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: null, isLoading: false, isProfileChecked: true }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: h.invoke } } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, string>) => (o?.studio ? `${k}:${o.studio}` : k),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't-1', name: 'Creative Ballet', subdomain: 'creativeballet' }),
}));
vi.mock('@/lib/resolveTenantSubdomain', () => ({ resolveTenantSubdomain: () => 'creativeballet' }));
vi.mock('@/legal/useLegalDocument', () => ({ useLegalLang: () => 'en' }));
vi.mock('@/components/PrivacyNotice', () => ({ PrivacyNotice: () => null }));
vi.mock('@/components/captcha/TurnstileWidget', () => ({
  TurnstileWidget: ({ onToken }: { onToken: (t: string) => void }) => (
    <button type="button" onClick={() => onToken('tok-1')}>pass check</button>
  ),
}));

import { InquiryForm } from '@/features/crm/components/InquiryForm';
import { buildEmbedSnippet, readEmbedLanguage, readInquiryTags } from '@/features/crm/lib/inquiryTags';
import { WebsiteFormSettings } from '@/features/settings/components/WebsiteFormSettings';
import {
  leadCaptchaPasses,
  normaliseCampaign,
} from '../../../../supabase/functions/_shared/crm-contract/lead-capture-guard.ts';

function renderAt(url: string, ui: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function fillName() {
  fireEvent.change(screen.getByLabelText(/pages.crm.inquire.name/), { target: { value: 'Dana' } });
}

function sentBody(): Record<string, unknown> {
  const calls = h.invoke.mock.calls as unknown as Array<[string, { body: Record<string, unknown> }]>;
  expect(calls).toHaveLength(1);
  expect(calls[0][0]).toBe('crm-lead-capture');
  return calls[0][1].body;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('InquiryForm without Turnstile', () => {
  it('sends src and campaign tags, and no marketing consent unless ticked', async () => {
    renderAt('/embed/inquire?src=website&campaign=open-day', <InquiryForm embedded />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('pages.crm.inquire.embed_title:Creative Ballet');
    fillName();
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.inquire.submit' }));
    await screen.findByRole('status');
    const body = sentBody();
    expect(body).toMatchObject({
      tenantSubdomain: 'creativeballet',
      name: 'Dana',
      src: 'website',
      campaign: 'open-day',
      captchaToken: null,
      marketingConsent: null,
    });
  });

  it('accepts UTM names for the tags', async () => {
    renderAt('/inquire?utm_source=instagram&utm_campaign=spring', <InquiryForm />);
    fillName();
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.inquire.submit' }));
    await screen.findByRole('status');
    expect(sentBody()).toMatchObject({ src: 'instagram', campaign: 'spring' });
  });

  it('marketing boxes start unticked and an opt-in is sent with its wording', async () => {
    renderAt('/inquire', <InquiryForm />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThan(0);
    boxes.forEach((box) => expect((box as HTMLInputElement).checked).toBe(false));
    fireEvent.click(boxes[0]);
    fillName();
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.inquire.submit' }));
    await screen.findByRole('status');
    const consent = sentBody().marketingConsent as { version: string; items: Array<{ kind: string; wording: string }> };
    expect(consent.items).toHaveLength(1);
    expect(consent.items[0].wording.length).toBeGreaterThan(0);
  });
});

describe('InquiryForm with Turnstile', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-1');
  });

  it('does not send until the check is passed, then sends the token', async () => {
    renderAt('/embed/inquire', <InquiryForm embedded />);
    fillName();
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.inquire.submit' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'common.captcha_needed');
    expect(h.invoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'pass check' }));
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.inquire.submit' }));
    await screen.findByRole('status');
    expect(sentBody()).toMatchObject({ captchaToken: 'tok-1' });
  });

  it('a refused send shows the error and asks for a fresh check', async () => {
    h.invoke.mockResolvedValueOnce({ data: { error: 'captcha_failed' }, error: null });
    renderAt('/inquire', <InquiryForm />);
    fillName();
    fireEvent.click(screen.getByRole('button', { name: 'pass check' }));
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.inquire.submit' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'pages.crm.inquire.error');
    // The widget was re-rendered: the old token is gone.
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.inquire.submit' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('common.captcha_needed'));
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });
});

describe('tags and snippet', () => {
  it('reads tags, preferring our names over UTM', () => {
    expect(readInquiryTags(new URLSearchParams('src=whatsapp&utm_source=x&campaign=a&utm_campaign=b'))).toEqual({
      src: 'whatsapp',
      campaign: 'a',
    });
    expect(readInquiryTags(new URLSearchParams(''))).toEqual({ src: null, campaign: null });
    expect(readEmbedLanguage(new URLSearchParams('lang=he'))).toBe('he');
    expect(readEmbedLanguage(new URLSearchParams('lang=fr'))).toBeNull();
  });

  it('builds an iframe on the studio host, escaping the title and campaign', () => {
    const s = buildEmbedSnippet({
      origin: 'https://creativeballet.opalswift.com',
      title: 'A "quoted" <studio>',
      campaign: 'open day & more',
      lang: 'he',
    });
    expect(s.url).toBe('https://creativeballet.opalswift.com/embed/inquire?src=website&campaign=open+day+%26+more&lang=he');
    expect(s.iframe).toContain('src="https://creativeballet.opalswift.com/embed/inquire?src=website&amp;campaign=open+day+%26+more&amp;lang=he"');
    expect(s.iframe).toContain('title="A &quot;quoted&quot; &lt;studio&gt;"');
    expect(s.link).toBe('https://creativeballet.opalswift.com/inquire?src=website&campaign=open+day+%26+more&lang=he');
  });

  it('Settings shows the snippet and updates it with the campaign', () => {
    renderAt('/admin/setup/settings', <WebsiteFormSettings />);
    const code = screen.getByLabelText('settings.website_form.snippet_label') as HTMLTextAreaElement;
    expect(code.value).toContain('/embed/inquire?src=website');
    fireEvent.change(screen.getByLabelText('settings.website_form.campaign_label'), { target: { value: 'flyer' } });
    expect(code.value).toContain('campaign=flyer');
  });
});

describe('server guards (crm-lead-capture)', () => {
  it('Turnstile is required only when a secret is set', async () => {
    const verify = vi.fn(async () => true);
    expect(await leadCaptchaPasses({ secret: null, token: null, verify })).toBe(true);
    expect(await leadCaptchaPasses({ secret: 's', token: null, verify })).toBe(false);
    expect(verify).not.toHaveBeenCalled();
    expect(await leadCaptchaPasses({ secret: 's', token: 't', verify })).toBe(true);
    expect(await leadCaptchaPasses({ secret: 's', token: 't', verify: async () => false })).toBe(false);
  });

  it('campaign is cleaned and capped', () => {
    expect(normaliseCampaign('  open\nday ')).toBe('open day');
    expect(normaliseCampaign('')).toBeNull();
    expect(normaliseCampaign('x'.repeat(300))).toHaveLength(100);
  });
});

describe('frame headers (public/_headers)', () => {
  const text = readFileSync(resolve(__dirname, '../../public/_headers'), 'utf8');
  const rules = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = line.trim();
      rules.set(current, []);
    } else if (current) {
      rules.get(current)!.push(line.trim());
    }
  }

  it('every page denies framing by default', () => {
    expect(rules.get('/*')).toContain('X-Frame-Options: DENY');
  });

  it('only /embed/* may be framed, and only by https sites', () => {
    expect(rules.get('/embed/*')).toEqual(['! X-Frame-Options', 'Content-Security-Policy: frame-ancestors https:']);
    const relaxing = [...rules].filter(([, lines]) => lines.some((l) => /X-Frame-Options/.test(l) && l.startsWith('!')));
    expect(relaxing.map(([path]) => path)).toEqual(['/embed/*']);
  });
});
