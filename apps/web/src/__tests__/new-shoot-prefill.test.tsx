// @vitest-environment jsdom
/**
 * New shoot filled in by Ask OpalSwift ("Fill it in for me"): a new client's details,
 * the package by name, the date and the place are all filled in and editable, and
 * nothing is created until the admin presses a button.
 * Run: pnpm -C apps/web test new-shoot-prefill
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ createJob: vi.fn(async (_input: unknown) => 'eng-5') }));

vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 't-1', name: 'Lens Studio', currency: 'ILS', language_default: 'en' }),
}));
vi.mock('@/hooks/useEntityLabels', () => ({
  useEntityLabels: () => ({
    labels: { offering: { singular: 'Package', plural: 'Packages' }, account: { singular: 'Client', plural: 'Clients' } },
  }),
}));
vi.mock('@/components/shared', () => ({ PersonSearchCombobox: () => null }));
vi.mock('@/features/jobs/hooks/useJobs', () => ({
  useJobPackages: () => ({
    data: [
      { id: 'p1', name: 'Family shoot', duration_mins: 60, price_minor: 90000, currency: 'ILS', location: 'Studio', is_public: true },
      { id: 'p2', name: 'Wedding', duration_mins: 480, price_minor: 800000, currency: 'ILS', location: null, is_public: true },
    ],
  }),
  useJobs: () => ({ createJob: h.createJob, isCreating: false }),
}));
vi.mock('@/features/quotes/services/sendShootRequestQuote', () => ({ sendShootRequestQuote: vi.fn() }));

import i18n from '@/i18n/i18n';
import { JobCreateForm } from '@/features/jobs/components/JobCreateForm';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('New shoot filled in by Ask OpalSwift', () => {
  it('fills in the new client, package, date and place, and creates nothing by itself', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <JobCreateForm
            prefill={{
              clientName: 'Noa',
              clientEmail: 'noa@example.com',
              packageName: 'wedding',
              startsAt: '2026-12-01T10:00',
              location: 'The beach',
            }}
          />
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(screen.getByLabelText(/Client name/)).toHaveValue('Noa');
    expect(screen.getByLabelText(/Client email|Email/)).toHaveValue('noa@example.com');
    expect(screen.getByLabelText(/^Package/)).toHaveValue('p2');
    expect(screen.getByLabelText(/^Starts|^Date|^Start/)).toHaveValue('2026-12-01T10:00');
    expect(screen.getByLabelText(/Location|Where/)).toHaveValue('The beach');
    expect(h.createJob).not.toHaveBeenCalled();
  });
});
