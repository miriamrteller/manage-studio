// @vitest-environment jsdom
/**
 * Onboarding polish: filter placeholders, colour sets, ranges that stay left-to-right,
 * no empty photo box, tidy declaration title, and plain reasons for a greyed-out button.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: null, isLoading: false }) }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't1', currency: 'ILS', vertical: 'dance-studio' }) }));

import i18n from '@/i18n/i18n';
import { FilterMultiSelect } from '@/components/shared/table';
import { ColourPresets } from '@/components/colour/ColourPresets';
import { ClassCard } from '@/components/shared/ClassCard';
import { displayTemplateName } from '@/features/enrolment/components/WaiverStep';
import { OperatorOnboardingWizard } from '@/features/platform/components/OperatorOnboardingWizard';

const wrap = (ui: ReactElement) =>
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

describe('filter placeholder', () => {
  const options = [{ value: 'a', label: 'Active' }, { value: 'b', label: 'Full' }];
  it('says All when nothing is chosen, and Add another once something is', () => {
    const { rerender } = wrap(<FilterMultiSelect id="f" label="Status" options={options} selected={[]} onChange={() => {}} />);
    expect(screen.getByRole('option', { name: 'All' })).toBeInTheDocument();
    rerender(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <FilterMultiSelect id="f" label="Status" options={options} selected={[options[0]]} onChange={() => {}} />
          </MemoryRouter>
        </QueryClientProvider>
      </I18nextProvider>,
    );
    expect(screen.getByRole('option', { name: 'Add another…' })).toBeInTheDocument();
  });
});

describe('colour sets', () => {
  it('picking one sets both colours and marks it pressed', () => {
    const onPick = vi.fn();
    wrap(<ColourPresets primary="#5B6CFF" accent="#21D1C2" onPick={onPick} />);
    expect(screen.getByRole('button', { name: 'Opal blue' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Forest' }));
    expect(onPick).toHaveBeenCalledWith('#15803D', '#EAB308');
  });
});

describe('class card', () => {
  const cls = {
    id: 'c1', name: 'Mini ballet', season_id: 's1', start_time: '16:00:00', end_time: '16:40:00',
    min_age: 3, max_age: 4, price_minor: 20000, cover_image_path: null, updated_at: null,
    category_name: null, location: null,
  } as never;
  it('keeps time and age ranges left-to-right and draws no empty photo box', () => {
    const { container } = wrap(<ClassCard class={cls} currency="ILS" />);
    const ltr = container.querySelectorAll('bdi[dir="ltr"]');
    expect(ltr.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('.bg-gray-100')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('declaration title', () => {
  it('drops the internal "(child)" and version', () => {
    expect(displayTemplateName('Health declaration (child)v1')).toBe('Health declaration');
    expect(displayTemplateName('Health declaration (child) v2')).toBe('Health declaration');
    expect(displayTemplateName('Photography contract')).toBe('Photography contract');
  });
});

describe('greyed-out Next says why', () => {
  it('asks for the studio name first, then the address', () => {
    wrap(<OperatorOnboardingWizard />);
    const nextBtn = screen.getByRole('button', { name: 'Next' });
    expect(nextBtn).toBeDisabled();
    expect(screen.getByText("Enter the studio's name to continue.")).toBeInTheDocument();
    expect(nextBtn).toHaveAttribute('aria-describedby', 'ss-next-hint');
    fireEvent.change(screen.getByLabelText('Studio name'), { target: { value: 'Creative Ballet' } });
    expect(screen.getByText(/Enter a web address/)).toBeInTheDocument();
  });

  it('shows the address example', () => {
    wrap(<OperatorOnboardingWizard />);
    expect(screen.getByText(/For example: my-studio → my-studio\./)).toBeInTheDocument();
  });
});
