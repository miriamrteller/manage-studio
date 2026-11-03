// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import en from '@/i18n/en.json';
import he from '@/i18n/he.json';

const translate = (key: string, vars?: Record<string, unknown>) => {
  const raw = key.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown> | undefined)?.[p], en);
  const text = typeof raw === 'string' ? raw : key;
  return text.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(vars?.[name] ?? ''));
};
const i18n = { t: translate };
vi.mock('react-i18next', () => ({ useTranslation: () => i18n }));
vi.mock('@/hooks/useLogin', () => ({
  useLogin: () => ({
    isLoading: false,
    message: null,
    codeStep: false,
    codeEmail: '',
    captcha: null,
    onSubmit: vi.fn(),
    resetMessage: vi.fn(),
    verifyEmailCode: vi.fn(),
    resendEmailCode: vi.fn(),
    backToCodeSend: vi.fn(),
  }),
}));
vi.mock('@/components/shared', () => ({ LoginForm: () => <form aria-label="login form" /> }));

import LoginPage from '@/pages/LoginPage';

afterEach(cleanup);

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <LoginPage />
    </MemoryRouter>,
  );

describe('sign-in page notice', () => {
  it('explains the automatic sign-out, as a status message', () => {
    renderAt('/login?reason=inactivity');
    const notice = screen.getByRole('status');
    expect(notice.textContent).toBe('You were signed out after an hour without activity, to keep your account safe.');
  });

  it('is not shown on a normal visit, or for any other reason', () => {
    renderAt('/login');
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
    renderAt('/login?reason=something-else');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('exists in Hebrew with the same placeholders', () => {
    const e = en.pages.login;
    const h = he.pages.login;
    for (const key of ['inactivity_notice', 'inactivity_duration_hour', 'inactivity_duration_minutes'] as const) {
      expect(typeof h[key], key).toBe('string');
      expect(h[key].match(/\{\{\w+\}\}/g) ?? [], key).toEqual(e[key].match(/\{\{\w+\}\}/g) ?? []);
    }
    expect(h.inactivity_notice).toContain('{{duration}}');
  });
});
