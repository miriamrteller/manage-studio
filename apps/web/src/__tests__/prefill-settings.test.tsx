// @vitest-environment jsdom
/**
 * Prefill in settings and announcements: what OpalSwift already knows fills
 * empty fields only, stays editable and is stored only when the admin saves.
 * - Settings → Legal: phone (the owner's own WhatsApp number, else their
 *   sign-in phone) and address (the one location all classes share).
 * - Settings → Payments: a drafted "pay at the studio" text from the studio's
 *   name, address and phone.
 * - Email announcement: ?offering= / ?account= presets (ids only, checked)
 *   and a greeting + sign-off with the studio's name.
 * Run: pnpm -C apps/web test prefill-settings.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const CLASS_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  authPhone: null as string | null,
  update: vi.fn(),
  legal: null as null | { name: string; profile: Record<string, string>; languageDefault: 'he' | 'en' },
  fetchBlastAccount: vi.fn(),
}));

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    user: { id: 'u-1', tenant_id: 't-1', full_name: 'Dana Levi', role: ['tenant_admin'] },
    isLoading: false,
    isProfileChecked: true,
  }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: null, error: null })),
    functions: { invoke: vi.fn() },
    auth: { getUser: async () => ({ data: { user: { phone: h.authPhone } }, error: null }) },
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        is: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: () => q,
        update: (v: unknown) => {
          h.update(v);
          return q;
        },
        then: (r: (v: unknown) => unknown) => r({ data: h.tables[table] ?? null, error: null }),
      };
      return q;
    },
  },
}));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: vi.fn() } }));
vi.mock('@/features/settings/hooks/useTenantHasPayment', () => ({
  TENANT_HAS_PAYMENT_QUERY: 'tenant-has-payment',
  useTenantHasPayment: () => false,
}));
vi.mock('@/legal/useLegalDocument', () => ({
  useTenantLegalProfile: () => ({
    data: h.legal ? { tenantId: 't-1', contactEmail: '', ...h.legal } : null,
    isLoading: false,
  }),
}));
vi.mock('@/features/classes/hooks/useClasses', () => ({
  useClasses: () => ({ classes: [{ id: CLASS_ID, name: 'Ballet 1' }], isLoading: false }),
}));
vi.mock('@/features/levels/hooks/useLevels', () => ({ useLevels: () => ({ levels: [], isLoading: false }) }));
vi.mock('@/features/notifications-admin/hooks/useNotificationBlast', () => ({
  useNotificationBlast: () => ({
    previewRecipients: vi.fn(),
    explainAccountExclusion: vi.fn(),
    isPreviewing: false,
    sendBlast: vi.fn(),
    isSending: false,
  }),
}));
vi.mock('@/features/notifications-admin/services/notificationBlastService', () => ({
  fetchBlastAccount: h.fetchBlastAccount,
}));

import i18n from '@/i18n/i18n';
import { legalAutofill, sharedClassLocation, useLegalAutofill } from '@/legal/autofill';
import type { TenantLegalProfile } from '@/legal/useLegalDocument';
import {
  draftOfflineInstructions,
  OfflinePaymentsSettingsForm,
} from '@/features/settings/components/OfflinePaymentsSettingsForm';
import {
  blastBodyHasMessage,
  blastBodyTemplate,
  NotificationBlastForm,
  presetId,
  presetOfferingId,
} from '@/features/notifications-admin/components/NotificationBlastForm';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

const tr = (key: string, opts: Record<string, string | undefined>) => i18n.t(key, opts) as string;

beforeEach(async () => {
  await setLanguage('en');
  h.tables = {};
  h.authPhone = null;
  h.legal = null;
  h.update.mockReset();
  h.fetchBlastAccount.mockReset();
});
afterEach(() => cleanup());

// ---------------------------------------------------------------- Row 21
describe('Settings → Legal: phone and address', () => {
  it('suggests the owner phone and the shared class address', () => {
    const out = legalAutofill(
      { tenantName: 'Studio', contactEmail: 'a@b.test', ownerPhone: ' 050-1234567 ', classLocation: 'Herzl 1, Haifa' },
      'en',
    );
    expect(out.phone).toBe('050-1234567');
    expect(out.address).toBe('Herzl 1, Haifa');
    expect(legalAutofill({ tenantName: 'Studio', contactEmail: '' }, 'en')).not.toHaveProperty('phone');
  });

  it('address only when every class with a location shares it', () => {
    expect(sharedClassLocation([])).toBeNull();
    expect(sharedClassLocation([{ location: null }, { location: '  ' }])).toBeNull();
    expect(sharedClassLocation([{ location: 'Herzl 1' }, { location: ' herzl  1 ' }, { location: null }])).toBe('Herzl 1');
    expect(sharedClassLocation([{ location: 'Herzl 1' }, { location: 'Bialik 2' }])).toBeNull();
    // A cancelled class elsewhere doesn't count.
    expect(sharedClassLocation([{ location: 'Herzl 1' }, { location: 'Bialik 2', status: 'cancelled' }])).toBe('Herzl 1');
  });

  const legal = {
    tenantId: 't-1',
    name: 'Studio',
    contactEmail: 'a@b.test',
    profile: {},
    languageDefault: 'en',
  } as unknown as TenantLegalProfile;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );

  it('loads the owner WhatsApp number and the classes address in Settings → Legal', async () => {
    h.tables = {
      tenants: {},
      offerings: [{ location: 'Herzl 1', status: 'active' }, { location: 'Herzl 1', status: 'full' }],
      people: { id: 'p-1' },
      contact_preferences: { whatsapp_number: '+972501234567' },
    };
    const { result } = renderHook(() => useLegalAutofill(legal, { studioSuggestions: true }), { wrapper });
    await waitFor(() => expect(result.current.autofill.phone).toBe('+972501234567'));
    expect(result.current.autofill.address).toBe('Herzl 1');
  });

  it('falls back to the sign-in phone; the legal pack (no studioSuggestions) never adds them', async () => {
    h.tables = { tenants: {}, offerings: [{ location: 'Herzl 1' }], people: null, contact_preferences: null };
    h.authPhone = '+972521111111';
    const { result } = renderHook(() => useLegalAutofill(legal, { studioSuggestions: true }), { wrapper });
    await waitFor(() => expect(result.current.autofill.phone).toBe('+972521111111'));

    const pack = renderHook(() => useLegalAutofill(legal), { wrapper });
    await waitFor(() => expect(pack.result.current.isLoading).toBe(false));
    expect(pack.result.current.autofill).not.toHaveProperty('phone');
    expect(pack.result.current.autofill).not.toHaveProperty('address');
  });
});

// ---------------------------------------------------------------- Row 22
describe('Settings → Payments: drafted offline instructions', () => {
  it('builds the draft from what is known and leaves out the rest (en, he)', async () => {
    expect(draftOfflineInstructions({ name: 'Studio Ltd', address: 'Herzl 1', phone: '050-1' }, tr)).toBe(
      'Pay in cash at Herzl 1, or by bank transfer to Studio Ltd. Questions: 050-1.',
    );
    expect(draftOfflineInstructions({ name: 'Studio Ltd' }, tr)).toBe(
      'Pay in cash at the studio, or by bank transfer to Studio Ltd.',
    );
    expect(draftOfflineInstructions({}, tr)).toBe('');
    expect(draftOfflineInstructions({ name: 'סטודיו', phone: '050-1' }, tr, 'he')).toBe(
      'אפשר לשלם במזומן בסטודיו, או בהעברה בנקאית לפקודת סטודיו. לשאלות: 050-1.',
    );
  });

  it('starts an empty box with the draft, marked as a suggestion; saved only on Save', async () => {
    setTenant('dance', { payment_provider: 'offline', offline_payment_instructions: '' });
    h.legal = { name: 'Test Studio', profile: { legal_name: 'Studio Ltd', address: 'Herzl 1', phone: '050-1' }, languageDefault: 'en' };
    renderInApp(<OfflinePaymentsSettingsForm />);
    const box = screen.getByLabelText('Payment instructions shown to parents');
    expect(box).toHaveValue('Pay in cash at Herzl 1, or by bank transfer to Studio Ltd. Questions: 050-1.');
    expect(screen.getByText(/We drafted this from your studio details/)).toBeInTheDocument();
    expect(h.update).not.toHaveBeenCalled();

    fireEvent.change(box, { target: { value: 'Bank 12' } });
    expect(box).toHaveValue('Bank 12');
    expect(screen.queryByText(/We drafted this/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(h.update).toHaveBeenCalledWith({ payment_provider: 'offline', offline_payment_instructions: 'Bank 12' }),
    );
  });

  it('never replaces saved instructions', () => {
    setTenant('dance', { payment_provider: 'offline', offline_payment_instructions: 'Cash at the desk' });
    h.legal = { name: 'Test Studio', profile: { address: 'Herzl 1' }, languageDefault: 'en' };
    renderInApp(<OfflinePaymentsSettingsForm />);
    expect(screen.getByLabelText('Payment instructions shown to parents')).toHaveValue('Cash at the desk');
    expect(screen.queryByText(/We drafted this/)).toBeNull();
  });
});

// ---------------------------------------------------------------- Row 23
describe('Email announcement: presets and greeting', () => {
  it('pure helpers', () => {
    expect(presetId('nope')).toBeNull();
    expect(presetId(CLASS_ID)).toBe(CLASS_ID);
    expect(presetOfferingId(CLASS_ID, [{ id: CLASS_ID }])).toBe(CLASS_ID);
    expect(presetOfferingId('33333333-3333-4333-8333-333333333333', [{ id: CLASS_ID }])).toBeNull();
    const tpl = blastBodyTemplate('Test Studio', 'Hi,');
    expect(tpl).toBe('Hi,\n\n\n\n— Test Studio');
    expect(blastBodyTemplate('', 'Hi,')).toBe('');
    expect(blastBodyHasMessage(tpl, tpl)).toBe(false);
    expect(blastBodyHasMessage('Hi,\n\nClass is off tomorrow.\n\n— Test Studio', tpl)).toBe(true);
    expect(blastBodyHasMessage('  ', '')).toBe(false);
  });

  it('starts the message with a greeting and the studio sign-off (en, he)', async () => {
    setTenant('dance');
    const { unmount } = renderInApp(<NotificationBlastForm />);
    expect(screen.getByLabelText('Message')).toHaveValue('Hi,\n\n\n\n— Test Studio');
    unmount();
    await setLanguage('he');
    renderInApp(<NotificationBlastForm />);
    expect(screen.getByRole('textbox', { name: i18n.t('pages.notifications.body_label') })).toHaveValue(
      'שלום,\n\n\n\n— Test Studio',
    );
  });

  it('?offering= presets the class when it is one of the listed classes', async () => {
    setTenant('dance');
    renderInApp(<NotificationBlastForm />, { path: '/admin/notifications', initialEntry: `/admin/notifications?offering=${CLASS_ID}` });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'By class' })).toBeChecked());
    expect(screen.getByRole('combobox', { name: i18n.t('pages.notifications.class_label') })).toHaveValue(CLASS_ID);
  });

  it('ignores an unknown class id', async () => {
    setTenant('dance');
    renderInApp(<NotificationBlastForm />, {
      path: '/admin/notifications',
      initialEntry: '/admin/notifications?offering=33333333-3333-4333-8333-333333333333',
    });
    expect(screen.getByRole('radio', { name: 'All families' })).toBeChecked();
  });

  it('?account= presets the recipient once the account is found', async () => {
    setTenant('dance');
    h.fetchBlastAccount.mockResolvedValue({
      account_id: ACCOUNT_ID,
      account_name: 'Cohen',
      contact_name: 'Noa Cohen',
      contact_email: 'noa@test.test',
    });
    renderInApp(<NotificationBlastForm />, { path: '/admin/notifications', initialEntry: `/admin/notifications?account=${ACCOUNT_ID}` });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'By account' })).toBeChecked());
    expect(h.fetchBlastAccount).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(screen.getByDisplayValue('Cohen — Noa Cohen (noa@test.test)')).toBeInTheDocument();
  });

  it('a malformed account id is not looked up', () => {
    setTenant('dance');
    renderInApp(<NotificationBlastForm />, { path: '/admin/notifications', initialEntry: '/admin/notifications?account=bob@x.test' });
    expect(h.fetchBlastAccount).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'All families' })).toBeChecked();
  });
});
