// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import en from '@/i18n/en.json';
import he from '@/i18n/he.json';
import { NoFamilyAccountError } from '@/features/enrolment/lib/resolveGuardianProfile';

const portal = vi.hoisted(() => ({ error: null as Error | null }));

vi.mock('@/components/Dashboard/useParentPortal', () => ({
  useParentPortal: () => ({ data: null, isLoading: false, error: portal.error }),
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't1', subdomain: 'ballet' }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown> | undefined)?.[p], en) ?? key,
    i18n: { language: 'en' },
  }),
}));

import { ParentPortal } from '@/components/Dashboard/ParentPortal';

describe('ParentPortal error message', () => {
  it('says the family account was not found (not "Failed to load dashboard")', () => {
    portal.error = new NoFamilyAccountError();
    render(<MemoryRouter><ParentPortal /></MemoryRouter>);
    expect(screen.getByRole('alert').textContent).toBe(en.errors.no_family_account);
    expect(screen.getByRole('alert').textContent).not.toContain('Failed to load dashboard');
  });

  it('still says "Failed to load dashboard" for a real failure', () => {
    portal.error = new Error('boom');
    render(<MemoryRouter><ParentPortal /></MemoryRouter>);
    expect(screen.getByRole('alert').textContent).toBe(en.errors.dashboard_load_failed);
  });

  it('the new message exists in English and Hebrew', () => {
    expect(typeof en.errors.no_family_account).toBe('string');
    expect(typeof he.errors.no_family_account).toBe('string');
  });
});
