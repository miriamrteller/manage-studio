import type { ReactNode } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render as baseRender, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n/i18n';
import { ProviderCheckoutShell } from './EnrolmentCheckoutShells';

// The component reads its words from i18n. Give it the app's own instance in English every time,
// so the result never depends on which other test ran first (alone, it used to render bare keys).
const render = (ui: ReactNode) => baseRender(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('ProviderCheckoutShell for a pay-at-the-studio tenant', () => {
  it('shows the pay-at-the-studio notice and no card form', () => {
    render(
      <MemoryRouter>
        <ProviderCheckoutShell
          classId="c-1"
          engagementId="e-1"
          paymentProvider="offline"
          clientSecret={null}
          publishableKey={null}
          amountMinor={30000}
          currency="ILS"
          mockPaymentRef={null}
          pageUrl={null}
          onPaid={() => {}}
          onPrevious={() => {}}
        />
      </MemoryRouter>,
    );
    const notice = screen.getByRole('status');
    expect(notice.querySelector('h3')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/dashboard');
    // No card form or provider shell.
    expect(document.querySelector('form')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('when online payment is chosen but not connected: the same calm notice, with a clear reason, no error', () => {
    render(
      <MemoryRouter>
        <ProviderCheckoutShell
          classId="c-1"
          engagementId="e-1"
          paymentProvider="offline"
          onlinePaymentNotSetUp
          clientSecret={null}
          publishableKey={null}
          amountMinor={30000}
          currency="ILS"
          mockPaymentRef={null}
          pageUrl={null}
          onPaid={() => {}}
          onPrevious={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/hasn't set up online payment yet/);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('form')).toBeNull();
  });
});
