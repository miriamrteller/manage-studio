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
    // Text may be the key or the English string, depending on whether i18n is loaded.
    expect(screen.getByText(/offline_payment_title|Pay at the studio/)).toBeTruthy();
    expect(screen.queryByText(/common\.loading|Loading/)).toBeNull();
  });
});
