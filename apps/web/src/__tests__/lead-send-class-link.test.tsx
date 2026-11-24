import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o?.email ? `${k}:${o.email}` : k), i18n: { language: 'en' } }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));

import { SendLeadLinkButton } from '@/features/crm/components/SendLeadLinkButton';
import { studioLinkEmail } from '@shared/index';

beforeEach(() => invoke.mockReset());

describe('Lead next step without quotes: one button emails the class list or booking page', () => {
  it('sends the class link with the first name, then says where it went', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const onSent = vi.fn();
    render(
      <SendLeadLinkButton kind="class_link" lead={{ id: 'l1', name: 'Dana Levi', email: 'dana@example.test' }} onSent={onSent} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.leads.send_class_link' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('pages.crm.leads.link_sent:dana@example.test'));
    expect(invoke).toHaveBeenCalledWith('send-lead-form-link', {
      body: { kind: 'class_link', email: 'dana@example.test', name: 'Dana', lang: 'en' },
    });
    expect(onSent).toHaveBeenCalledOnce();
  });

  it('shows the error and keeps the button when sending fails', async () => {
    invoke.mockResolvedValue({ data: { error: 'recipient_cooldown' }, error: null });
    render(<SendLeadLinkButton kind="booking_link" lead={{ id: 'l1', name: 'Dana', email: 'dana@example.test' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.leads.send_booking_link' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('pages.crm.get_leads.send_error_recipient_cooldown'));
    expect(screen.getByRole('button', { name: 'pages.crm.leads.send_booking_link' })).toBeTruthy();
  });

  it('without an email there is no button', () => {
    render(<SendLeadLinkButton kind="class_link" lead={{ id: 'l1', name: 'Dana', email: null }} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('the emails link to /classes and /book in English and Hebrew', () => {
    const en = studioLinkEmail({ studio: 'Bella', url: 'https://bella.example/classes', kind: 'class_link', lang: 'en' });
    expect(en.subject).toBe('Bella: our classes');
    expect(en.html).toContain('https://bella.example/classes');
    const he = studioLinkEmail({ studio: 'Bella', url: 'https://bella.example/book', kind: 'booking_link', lang: 'he' });
    expect(he.text).toContain('https://bella.example/book');
    expect(he.html).toContain('dir="rtl"');
  });
});
