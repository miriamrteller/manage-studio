// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pickAccountExclusion } from '@/features/notifications-admin/lib/accountExclusion';

const db = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  boom: false,
}));

vi.mock('@/lib/supabase', () => {
  const chain = (table: string) => {
    const result = () => ({ data: db.tables[table] ?? null, error: null });
    const api: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'order', 'limit']) api[m] = () => api;
    api.maybeSingle = () => Promise.resolve(result());
    api.then = (resolve: (v: unknown) => void) => resolve(result());
    return api;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (db.boom) throw new Error('network');
        return chain(table);
      },
      rpc: vi.fn(),
      functions: { invoke: vi.fn() },
    },
  };
});

import { explainAccountExclusion } from '@/features/notifications-admin/services/notificationBlastService';

const ok = { email: 'a@b.test', emailOptedIn: true, notifyAnnouncements: true, purpose: 'service' as const, marketingGranted: false };

describe('pickAccountExclusion', () => {
  it('has no reason when the contact can be emailed', () => {
    expect(pickAccountExclusion(ok)).toBeNull();
    // a missing preferences row means opted in
    expect(pickAccountExclusion({ ...ok, emailOptedIn: null, notifyAnnouncements: undefined })).toBeNull();
  });

  it('reports a missing or blank email first', () => {
    expect(pickAccountExclusion({ ...ok, email: null })).toBe('no_email');
    expect(pickAccountExclusion({ ...ok, email: '   ', emailOptedIn: false })).toBe('no_email');
  });

  it('reports opt-outs', () => {
    expect(pickAccountExclusion({ ...ok, emailOptedIn: false })).toBe('email_opted_out');
    expect(pickAccountExclusion({ ...ok, notifyAnnouncements: false })).toBe('announcements_off');
  });

  it('needs marketing consent only for marketing sends', () => {
    expect(pickAccountExclusion({ ...ok, purpose: 'marketing' })).toBe('no_marketing_consent');
    expect(pickAccountExclusion({ ...ok, purpose: 'marketing', marketingGranted: true })).toBeNull();
    expect(pickAccountExclusion({ ...ok, purpose: 'service' })).toBeNull();
  });
});

describe('explainAccountExclusion', () => {
  beforeEach(() => {
    db.boom = false;
    db.tables = {
      accounts: { person_id: 'p1' },
      people: { email: 'carol@x.test' },
      contact_preferences: null,
      consent_records: [],
    };
  });

  it('is null when the contact can be emailed for a service update', async () => {
    expect(await explainAccountExclusion('acc1', 'service')).toBeNull();
  });

  it('explains a contact with no email', async () => {
    db.tables.people = { email: null };
    expect(await explainAccountExclusion('acc1', 'service')).toBe('no_email');
  });

  it('explains an email opt-out', async () => {
    db.tables.contact_preferences = { email_opted_in: false, notify_announcements: true };
    expect(await explainAccountExclusion('acc1', 'service')).toBe('email_opted_out');
  });

  it('explains missing marketing consent, and accepts a granted one', async () => {
    expect(await explainAccountExclusion('acc1', 'marketing')).toBe('no_marketing_consent');
    db.tables.consent_records = [{ granted: true }];
    expect(await explainAccountExclusion('acc1', 'marketing')).toBeNull();
  });

  it('falls back to no reason when the account cannot be found or the lookup fails', async () => {
    db.tables.accounts = null;
    expect(await explainAccountExclusion('missing', 'service')).toBeNull();
    db.boom = true;
    expect(await explainAccountExclusion('acc1', 'service')).toBeNull();
  });
});
