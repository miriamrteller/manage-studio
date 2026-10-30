import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuardianSelfSection } from '@/components/Dashboard/GuardianSelfSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const guardian = {
  personId: 'p1',
  accountId: 'a1',
  accountMemberId: 'm1',
  name: 'Daniel Avraham',
  email: 'daniel@example.com',
  phone: null,
  dateOfBirth: null,
};

describe('GuardianSelfSection', () => {
  it('shows class enrolment and the date-of-birth prompt for programs', () => {
    render(<GuardianSelfSection guardian={guardian} enrolments={[]} onEnrol={() => undefined} />);
    expect(screen.getByText('pages.portal.myself_heading')).toBeInTheDocument();
    expect(screen.getByText('pages.portal.myself_dob_missing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pages.classes.enrol' })).toBeInTheDocument();
  });

  it('shows "My shoots" without class enrolment or date of birth for photographers', () => {
    render(
      <GuardianSelfSection guardian={guardian} enrolments={[]} onEnrol={() => undefined} appointmentMode />,
    );
    expect(screen.getByText('pages.portal.my_shoots_heading')).toBeInTheDocument();
    expect(screen.getByText('pages.portal.no_shoots')).toBeInTheDocument();
    expect(screen.queryByText('pages.portal.myself_dob_missing')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'pages.classes.enrol' })).not.toBeInTheDocument();
  });
});
