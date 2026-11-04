// @vitest-environment jsdom
/**
 * Settings → Studio profile: the studio email (tenants.contact_email: Reply-To on
 * client emails, enquiry alerts) is editable and separate from the login email.
 * When it changes, the studio is offered (never forced) to update legal-page
 * emails that still hold the old address.
 * Run: pnpm -C apps/web test studio-email-setting.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  row: { contact_email: 'owner@login.test', legal_profile: {} as Record<string, unknown> },
  updates: [] as Record<string, unknown>[],
  authUpdates: 0,
}));

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
import { SchoolProfileForm, legalEmailsCopiedFrom } from '@/features/settings/components/SchoolProfileForm';

function renderForm() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <SchoolProfileForm />
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

describe('studio email', () => {
  it('starts from the current studio email and saves a new one on the studio only', async () => {
    renderForm();
    const field = await screen.findByLabelText('Studio email');
    await waitFor(() => expect(field).toHaveValue('owner@login.test'));
    expect(screen.getByText(/Your login email does not change/)).toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'hello@lumen.studio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.updates[0]).toEqual({ name: 'Lumen', contact_email: 'hello@lumen.studio' }));
    expect(h.authUpdates).toBe(0);
    // No legal email held the old address: nothing to offer.
    expect(screen.queryByRole('button', { name: 'Update legal pages' })).toBeNull();
  });

  it('refuses an address that is not an email, without saving', async () => {
    renderForm();
    const field = await screen.findByLabelText('Studio email');
    await waitFor(() => expect(field).toHaveValue('owner@login.test'));
    fireEvent.change(field, { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a valid email address for the studio.')).toBeInTheDocument();
    expect(h.updates).toEqual([]);
  });

  it('offers to update legal emails that still hold the old address; "Not now" leaves them', async () => {
    h.row.legal_profile = { email: 'owner@login.test', privacy_contact_email: 'OWNER@login.test', accessibility_contact_email: 'other@x.test' };
    renderForm();
    const field = await screen.findByLabelText('Studio email');
    await waitFor(() => expect(field).toHaveValue('owner@login.test'));
    fireEvent.change(field, { target: { value: 'hello@lumen.studio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/still show owner@login.test in 2 places/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('button', { name: 'Update legal pages' })).toBeNull();
    expect(h.updates).toHaveLength(1);
  });

  it('"Update legal pages" changes only those emails', async () => {
    h.row.legal_profile = { email: 'owner@login.test', privacy_contact_email: 'owner@login.test', accessibility_contact_email: 'other@x.test', phone: '050' };
    renderForm();
    const field = await screen.findByLabelText('Studio email');
    await waitFor(() => expect(field).toHaveValue('owner@login.test'));
    fireEvent.change(field, { target: { value: 'hello@lumen.studio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Update legal pages' }));
    await waitFor(() =>
      expect(h.updates[1]).toEqual({
        legal_profile: { email: 'hello@lumen.studio', privacy_contact_email: 'hello@lumen.studio', accessibility_contact_email: 'other@x.test', phone: '050' },
      }),
    );
    expect(await screen.findByText('Legal pages now use the new studio email.')).toBeInTheDocument();
  });

  it('finds copied emails case-insensitively', () => {
    expect(legalEmailsCopiedFrom({ email: ' A@B.c ', privacy_contact_email: 'x@y.z' }, 'a@b.c')).toEqual(['email']);
    expect(legalEmailsCopiedFrom(null, 'a@b.c')).toEqual([]);
  });

  it('is in Hebrew too', async () => {
    await i18n.changeLanguage('he');
    renderForm();
    expect(await screen.findByLabelText('אימייל הסטודיו')).toBeInTheDocument();
  });
});
