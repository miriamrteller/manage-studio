// @vitest-environment jsdom
/**
 * Settings → Studio profile: the business email (tenants.contact_email: Reply-To on
 * client emails, enquiry alerts). "Same as my login email" is ticked while the two
 * match; unticked, it is its own address. The legal pages' email sits here too.
 * When it changes, the studio is offered (never forced) to update legal-page
 * emails that still hold the old address.
 * Run: pnpm -C apps/web test studio-email-setting.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  row: { contact_email: 'owner@login.test', legal_profile: {} as Record<string, unknown> },
  updates: [] as Record<string, unknown>[],
  authUpdates: 0,
}));

vi.mock('@/hooks/useAuth', () => ({ useAuthSession: () => ({ session: { user: { email: 'owner@login.test' } }, isLoading: false }) }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't1', name: 'Lumen', subdomain: 'lumen' }) }));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: vi.fn(async () => {}) } }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: false, error: null })),
    auth: { updateUser: vi.fn(async () => { h.authUpdates += 1; return { error: null }; }) },
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: { ...h.row }, error: null });
      chain.update = (row: Record<string, unknown>) => {
        h.updates.push(row);
        return { eq: async () => ({ error: null }) };
      };
      return chain;
    },
  },
}));

import i18n from '@/i18n/i18n';
import { SchoolProfileForm, legalEmailToStore, legalEmailsCopiedFrom } from '@/features/settings/components/SchoolProfileForm';

function renderForm() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <SchoolProfileForm />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  h.row = { contact_email: 'owner@login.test', legal_profile: {} };
  h.updates = [];
  h.authUpdates = 0;
});
afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

async function untick() {
  const tick = await screen.findByRole('checkbox', { name: 'Same as my login email (owner@login.test)' });
  await waitFor(() => expect(tick).toBeChecked());
  fireEvent.click(tick);
  return screen.getByRole('textbox', { name: 'Business email' });
}

describe('studio email', () => {
  it('matches the login: ticked, no field, and saving keeps it on the login', async () => {
    renderForm();
    const tick = await screen.findByRole('checkbox', { name: 'Same as my login email (owner@login.test)' });
    await waitFor(() => expect(tick).toBeChecked());
    expect(screen.queryByRole('textbox', { name: 'Business email' })).toBeNull();
    expect(screen.getByText(/If you change your login email, this changes with it/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Change it in Sign-in & security' })).toHaveAttribute('href', '/admin/settings?tab=security');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.updates[0]).toEqual({ name: 'Lumen', contact_email: 'owner@login.test' }));
    expect(h.authUpdates).toBe(0);
  });

  it('a different business email starts unticked, with the field showing it', async () => {
    h.row.contact_email = 'hello@lumen.studio';
    renderForm();
    const tick = await screen.findByRole('checkbox', { name: 'Same as my login email (owner@login.test)' });
    await waitFor(() => expect(tick).not.toBeChecked());
    expect(screen.getByRole('textbox', { name: 'Business email' })).toHaveValue('hello@lumen.studio');
  });

  it('unticking shows the field; re-ticking hides it but keeps what was typed', async () => {
    renderForm();
    const field = await untick();
    fireEvent.change(field, { target: { value: 'hello@lumen.studio' } });
    const tick = screen.getByRole('checkbox', { name: 'Same as my login email (owner@login.test)' });
    fireEvent.click(tick);
    expect(screen.queryByRole('textbox', { name: 'Business email' })).toBeNull();
    fireEvent.click(tick);
    expect(screen.getByRole('textbox', { name: 'Business email' })).toHaveValue('hello@lumen.studio');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.updates[0]).toEqual({ name: 'Lumen', contact_email: 'hello@lumen.studio' }));
    expect(h.authUpdates).toBe(0);
  });

  it('refuses an address that is not an email, without saving', async () => {
    renderForm();
    const field = await untick();
    fireEvent.change(field, { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a valid business email.')).toBeInTheDocument();
    expect(h.updates).toEqual([]);
  });

  it('the legal pages email sits under "Details we filled in for you" and follows the business email', async () => {
    h.row.legal_profile = { email: 'owner@login.test', phone: '050' };
    renderForm();
    expect(await screen.findByText('Details we filled in for you')).toBeInTheDocument();
    const legal = screen.getByLabelText('Email on your legal pages');
    await waitFor(() => expect(legal).toHaveValue('owner@login.test'));
    const field = await untick();
    fireEvent.change(field, { target: { value: 'hello@lumen.studio' } });
    expect(legal).toHaveValue('hello@lumen.studio');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    // Same as the business email: stored empty, so it keeps following it.
    await waitFor(() =>
      expect(h.updates[0]).toEqual({ name: 'Lumen', contact_email: 'hello@lumen.studio', legal_profile: { phone: '050' } }),
    );
  });

  it('a different legal pages email is kept and saved', async () => {
    h.row.legal_profile = { email: 'legal@lumen.studio' };
    renderForm();
    const legal = await screen.findByLabelText('Email on your legal pages');
    await waitFor(() => expect(legal).toHaveValue('legal@lumen.studio'));
    fireEvent.change(legal, { target: { value: 'terms@lumen.studio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(h.updates[0]).toEqual({ name: 'Lumen', contact_email: 'owner@login.test', legal_profile: { email: 'terms@lumen.studio' } }),
    );
  });

  it('offers to update the other legal emails that still hold the old address; "Not now" leaves them', async () => {
    h.row.legal_profile = { privacy_contact_email: 'OWNER@login.test', accessibility_contact_email: 'other@x.test' };
    renderForm();
    const field = await untick();
    fireEvent.change(field, { target: { value: 'hello@lumen.studio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/still show owner@login.test in 1 place/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('button', { name: 'Update legal pages' })).toBeNull();
    expect(h.updates).toHaveLength(1);
  });

  it('"Update legal pages" changes only those emails', async () => {
    h.row.legal_profile = { privacy_contact_email: 'owner@login.test', accessibility_contact_email: 'other@x.test', phone: '050' };
    renderForm();
    const field = await untick();
    fireEvent.change(field, { target: { value: 'hello@lumen.studio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Update legal pages' }));
    await waitFor(() =>
      expect(h.updates[1]).toEqual({
        legal_profile: { privacy_contact_email: 'hello@lumen.studio', accessibility_contact_email: 'other@x.test', phone: '050' },
      }),
    );
    expect(await screen.findByText('Legal pages now use the new business email.')).toBeInTheDocument();
  });

  it('finds copied emails case-insensitively', () => {
    expect(legalEmailsCopiedFrom({ email: ' A@B.c ', privacy_contact_email: 'x@y.z' }, 'a@b.c')).toEqual(['email']);
    expect(legalEmailsCopiedFrom(null, 'a@b.c')).toEqual([]);
  });

  it('stores the legal pages email only when it differs from the business email', () => {
    expect(legalEmailToStore(' A@B.c ', 'a@b.c')).toBe('');
    expect(legalEmailToStore('', 'a@b.c')).toBe('');
    expect(legalEmailToStore(' legal@b.c ', 'a@b.c')).toBe('legal@b.c');
  });

  it('is in Hebrew too', async () => {
    await i18n.changeLanguage('he');
    renderForm();
    expect(await screen.findByRole('checkbox', { name: 'זהה לאימייל ההתחברות שלי (owner@login.test)' })).toBeInTheDocument();
    expect(screen.getByText('פרטים שמילאנו בשבילך')).toBeInTheDocument();
    expect(screen.getByLabelText('האימייל בעמודים המשפטיים')).toBeInTheDocument();
  });
});
