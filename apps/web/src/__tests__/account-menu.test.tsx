import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/components/shared/SetPasswordDialog', () => ({
  SetPasswordDialog: ({ open }: { open: boolean }) => (open ? <div>password-dialog</div> : null),
}));
vi.mock('@/components/shared/ChangeLoginEmail', () => ({
  ChangeLoginEmailDialog: ({ open }: { open: boolean }) => (open ? <div>email-dialog</div> : null),
}));

import { AccountMenu } from '@/components/shared/AccountMenu';

describe('AccountMenu: one "My account" button on client and parent pages', () => {
  it('shows one button, opens the three account choices, and each opens its dialog', () => {
    const onPreferences = vi.fn();
    render(<AccountMenu onPreferences={onPreferences} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'nav.my_account' }));
    fireEvent.click(screen.getByRole('button', { name: 'pages.portal.notification_preferences' }));
    expect(onPreferences).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'pages.portal.login_password' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'nav.my_account' }));
    fireEvent.click(screen.getByRole('button', { name: 'pages.portal.login_password' }));
    expect(screen.getByText('password-dialog')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'nav.my_account' }));
    fireEvent.click(screen.getByRole('button', { name: 'login_email.change_title' }));
    expect(screen.getByText('email-dialog')).toBeTruthy();
  });
});
