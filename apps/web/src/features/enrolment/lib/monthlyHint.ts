/**
 * Hint under a monthly price. Card studios charge the saved card every month; a
 * pay-at-the-studio studio (payment_provider = 'offline') is paid in person.
 */
export function monthlyHintKey(paymentProvider: string | null | undefined): string {
  return paymentProvider === 'offline' ? 'enrolment.offline_monthly_hint' : 'enrolment.checkout_monthly_hint';
}
