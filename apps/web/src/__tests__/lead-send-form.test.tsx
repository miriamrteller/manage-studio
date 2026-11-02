// @vitest-environment jsdom
/**
 * 2c-ii: "Send the form to someone" and "Email these instructions to my web
 * person": the fixed email templates (packages/shared/src/leadShare.ts), the
 * server limits (lead-link-guard), and the UI.
 * Run: pnpm -C apps/web test lead-send-form
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  invoke: vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: { ok: true }, error: null })),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: h.invoke } } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o && Object.keys(o).length ? `${k}(${Object.values(o).join(',')})` : k),
    i18n: { language: 'en' },
  }),
}));

import { EmailInstructionsForm, SendFormSection, whatsappNumber } from '@/features/crm/components/SendFormSection';
import { WEBSITE_PLATFORMS, WEBSITE_STEPS, embedIframe, formLinkEmail, websiteInstructionsEmail } from '@shared/index';
import {
  TENANT_HOURLY_LIMIT,
  leadLinkLimitError,
  normaliseRecipient,
} from '../../../../supabase/functions/_shared/crm-contract/lead-link-guard.ts';

afterEach(() => vi.clearAllMocks());

describe('email templates (built on the server, no free text)', () => {
  it('form link email: the link tagged src=direct, studio and name escaped, nothing about marketing', () => {
    const e = formLinkEmail({
      studio: 'Ballet <b>& Co</b>',
      recipientName: 'Dana "D"',
      formUrl: 'https://studio.opalswift.com/inquire?src=direct',
      lang: 'en',
      colour: 'red;background:url(x)',
    });
    expect(e.subject).toBe('Ballet <b>& Co</b>: enquiry form');
    expect(e.html).toContain('href="https://studio.opalswift.com/inquire?src=direct"');
    expect(e.html).toContain('Ballet &lt;b&gt;&amp; Co&lt;/b&gt;');
    expect(e.html).toContain('Hello Dana &quot;D&quot;,');
    expect(e.html).not.toContain('url(x)'); // invalid colour falls back
    expect(e.html.toLowerCase()).not.toMatch(/newsletter|unsubscribe|marketing/);
    expect(e.text).toContain('https://studio.opalswift.com/inquire?src=direct');
  });

  it('Hebrew form email is right-to-left', () => {
    const e = formLinkEmail({ studio: 'סטודיו', formUrl: 'https://s.opalswift.com/inquire?src=direct', lang: 'he' });
    expect(e.html).toContain('dir="rtl"');
    expect(e.subject).toBe('טופס פנייה של סטודיו');
  });

  it('website instructions: the iframe for the studio host and steps for every builder', () => {
    const e = websiteInstructionsEmail({ studio: 'Studio', formOrigin: 'https://studio.opalswift.com', lang: 'he' });
    expect(e.html).toContain(
      'src=&quot;https://studio.opalswift.com/embed/inquire?src=website&quot;',
    );
    for (const p of WEBSITE_PLATFORMS) expect(e.html).toContain(WEBSITE_STEPS.he[p][0]);
    expect(e.text).toContain(embedIframe('https://studio.opalswift.com', 'Studio – טופס פנייה'));
  });
});

describe('server limits', () => {
  it('per studio per hour, then per recipient', () => {
    expect(leadLinkLimitError({ sentByTenantLastHour: 0, sentToRecipientRecently: false })).toBeNull();
    expect(leadLinkLimitError({ sentByTenantLastHour: TENANT_HOURLY_LIMIT, sentToRecipientRecently: false })).toBe('tenant_limit');
    expect(leadLinkLimitError({ sentByTenantLastHour: 1, sentToRecipientRecently: true })).toBe('recipient_cooldown');
  });

  it('accepts one plain address only', () => {
    expect(normaliseRecipient(' Dana@Example.COM ')).toBe('dana@example.com');
    expect(normaliseRecipient('a@b.c, d@e.f')).toBeNull();
    expect(normaliseRecipient('Dana <d@example.com>')).toBeNull();
    expect(normaliseRecipient('nope')).toBeNull();
    expect(normaliseRecipient(42)).toBeNull();
  });
});

describe('WhatsApp numbers', () => {
  it.each([
    ['050-123 4567', 'IL', '972501234567'],
    ['+972 50 123 4567', 'IL', '972501234567'],
    ['00972501234567', 'IL', '972501234567'],
    ['(212) 555-0100', 'US', '2125550100'],
    ['', 'IL', null],
  ])('%s (%s) → %s', (raw, country, expected) => {
    expect(whatsappNumber(raw, country)).toBe(expected);
  });
});

describe('Send the form to someone', () => {
  const renderIt = () =>
    render(
      <SendFormSection
        headingLevel={3}
        formLinkForWhatsApp="https://studio.opalswift.com/inquire?src=whatsapp"
        shareMessage="Get in touch:"
        country="IL"
      />,
    );

  it('emails through the server function with only the recipient, name and language', async () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('pages.crm.get_leads.send_name'), { target: { value: 'Dana' } });
    fireEvent.change(screen.getByLabelText('pages.crm.get_leads.send_email'), { target: { value: 'dana@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.get_leads.send_by_email' }));
    expect(await screen.findByText('pages.crm.get_leads.send_done(dana@example.com)')).toBeTruthy();
    expect(h.invoke).toHaveBeenCalledWith('send-lead-form-link', {
      body: { kind: 'form', email: 'dana@example.com', name: 'Dana', lang: 'en' },
    });
  });

  it('explains a rate limit from the server', async () => {
    h.invoke.mockResolvedValueOnce({
      data: null,
      error: { context: { json: async () => ({ error: 'recipient_cooldown' }) } },
    });
    renderIt();
    fireEvent.change(screen.getByLabelText('pages.crm.get_leads.send_email'), { target: { value: 'dana@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.get_leads.send_by_email' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'pages.crm.get_leads.send_error_recipient_cooldown');
  });

  it('WhatsApp opens a chat with that number and the whatsapp-tagged link, without the server', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderIt();
    const wa = screen.getByRole('button', { name: 'pages.crm.get_leads.send_by_whatsapp' }) as HTMLButtonElement;
    expect(wa.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('pages.crm.get_leads.send_phone'), { target: { value: '050-1234567' } });
    fireEvent.click(wa);
    const url = String(open.mock.calls[0][0]);
    expect(url.startsWith('https://wa.me/972501234567?text=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('https://studio.opalswift.com/inquire?src=whatsapp');
    expect(h.invoke).not.toHaveBeenCalled();
    open.mockRestore();
  });
});

describe('Email these instructions to my web person', () => {
  it('sends kind web_instructions', async () => {
    render(<EmailInstructionsForm />);
    fireEvent.change(screen.getByLabelText('pages.crm.get_leads.instructions_title'), { target: { value: 'web@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.get_leads.instructions_send' }));
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith('send-lead-form-link', {
        body: { kind: 'web_instructions', email: 'web@example.com', name: null, lang: 'en' },
      }),
    );
  });
});
