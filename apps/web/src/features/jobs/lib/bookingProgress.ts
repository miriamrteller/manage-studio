/**
 * Admin "Booking progress" for a shoot booked from a quote:
 * Quote accepted → Contract signed → Deposit paid.
 */
export type BookingStepKey = 'quote_accepted' | 'contract_signed' | 'deposit_paid';

export interface BookingStep {
  key: BookingStepKey;
  done: boolean;
  /** When the step completed, if known. */
  at: string | null;
  /** The booking has no deposit, so this step does not apply. */
  notApplicable?: boolean;
}

export interface AcceptedQuoteSnapshot {
  accepted_at: string;
  accepted_result: { deposit_minor?: number | null; payment_request_ids?: unknown } | null;
}

/** accept_quote() inserts the deposit first, and only when deposit_minor > 0. */
export function depositRequestId(result: AcceptedQuoteSnapshot['accepted_result']): string | null {
  if (!result || !(typeof result.deposit_minor === 'number' && result.deposit_minor > 0)) return null;
  const ids = Array.isArray(result.payment_request_ids) ? result.payment_request_ids : [];
  return typeof ids[0] === 'string' ? ids[0] : null;
}

export function buildBookingProgress(input: {
  acceptedQuote: AcceptedQuoteSnapshot;
  contractSigned: boolean;
  contractSignedAt: string | null;
  requests: Array<{ id: string; status: string; paid_at: string | null }>;
}): BookingStep[] {
  const depositId = depositRequestId(input.acceptedQuote.accepted_result);
  const deposit = depositId ? input.requests.find((r) => r.id === depositId) ?? null : null;
  const depositPaid = deposit?.status === 'paid' || deposit?.status === 'refunded_manual';
  return [
    { key: 'quote_accepted', done: true, at: input.acceptedQuote.accepted_at },
    { key: 'contract_signed', done: input.contractSigned, at: input.contractSigned ? input.contractSignedAt : null },
    depositId
      ? { key: 'deposit_paid', done: depositPaid, at: depositPaid ? deposit?.paid_at ?? null : null }
      : { key: 'deposit_paid', done: false, at: null, notApplicable: true },
  ];
}
