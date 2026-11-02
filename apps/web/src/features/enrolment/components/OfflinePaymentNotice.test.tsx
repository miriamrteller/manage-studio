import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProviderCheckoutShell } from './EnrolmentCheckoutShells';

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
    // Language-independent: other tests may leave i18n in English, Hebrew or keys only.
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
    expect(screen.getByRole('status')).toHaveTextContent(/hasn't set up online payment yet|עוד לא הגדיר תשלום אונליין/);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('form')).toBeNull();
  });
});
