/**
 * Which invoicing (tax document) services can work with which payment providers
 * (payments audit P1 #5). Pure, no imports; mirrored from supabase/functions/_shared/provider-pairing.ts
 * (a test checks the two agree).
 *
 *  - grow / icount / invoice4u issue the document together with their OWN card charge and
 *    have no standalone document API, so they only pair with the same payment provider.
 *  - ypay issues the document with its own card charge, and standalone documents for cash /
 *    bank transfer, but refuses other providers' card payments: ypay or offline payments.
 *  - green_invoice issues standalone documents for any payment.
 *  - takbull issues the document with its own card charge, and standalone documents for money
 *    recorded by hand: takbull or offline payments. Not offered yet (hidden until Takbull is
 *    launched), so it is not in PAIRABLE_INVOICING_PROVIDERS.
 *  - none: no documents through OpalSwift; pairs with anything.
 *  - yesh and tranzila invoicing are not built yet, so they are never offered.
 */
export const PAIRABLE_INVOICING_PROVIDERS = [
  'grow',
  'icount',
  'invoice4u',
  'ypay',
  'green_invoice',
  'none',
] as const;

/**
 * Owner decision 2026-11-10 (docs/plans/PAYMENT-OPTIONS-DECISION.md): the only payment choices
 * are the studio's own YPay, pay at the studio, and later Takbull. These are hidden from every
 * choice (the code stays until Takbull is live). A studio already on one still sees it.
 */
export const HIDDEN_PAYMENT_PROVIDERS = ['grow', 'invoice4u'] as const;
export const HIDDEN_INVOICING_PROVIDERS = ['grow', 'invoice4u', 'green_invoice'] as const;

export function isHiddenInvoicingProvider(slug: string | null | undefined): boolean {
  return (HIDDEN_INVOICING_PROVIDERS as readonly string[]).includes(slug ?? '');
}

/** Invoicing services that exist in the data model but are not finished: never offered. */
export const UNFINISHED_INVOICING_PROVIDERS = ['yesh', 'tranzila'] as const;

/**
 * Payment providers that are not finished (payments audit P2 #9, #10): Tranzila reads every
 * success as a failure, and iCount cannot confirm a payment outside mock mode. Not offered to
 * new studios or as a new choice; a studio that already uses one keeps it.
 */
export const UNFINISHED_PAYMENT_PROVIDERS = ['icount', 'tranzila'] as const;

export function isUnfinishedPaymentProvider(slug: string | null | undefined): boolean {
  return (UNFINISHED_PAYMENT_PROVIDERS as readonly string[]).includes(slug ?? '');
}

const BUNDLED_ONLY = new Set(['grow', 'icount', 'invoice4u']);

export function invoicingPairsWithPayment(paymentProvider: string, invoicingProvider: string): boolean {
  if ((UNFINISHED_INVOICING_PROVIDERS as readonly string[]).includes(invoicingProvider)) return false;
  if (invoicingProvider === 'none' || invoicingProvider === 'green_invoice') return true;
  if (BUNDLED_ONLY.has(invoicingProvider)) return invoicingProvider === paymentProvider;
  if (invoicingProvider === 'ypay') return paymentProvider === 'ypay' || paymentProvider === 'offline';
  if (invoicingProvider === 'takbull') return paymentProvider === 'takbull' || paymentProvider === 'offline';
  return false;
}

/** The invoicing services that may be chosen with this payment provider, in display order. */
export function invoicingOptionsFor(paymentProvider: string): string[] {
  return PAIRABLE_INVOICING_PROVIDERS.filter((slug) => invoicingPairsWithPayment(paymentProvider, slug));
}

/**
 * Payment providers whose callback settles a photographer's job payment request (deposit /
 * balance link): YPay, Grow since the notice handler settles job requests (payments audit
 * P2 #11), and Takbull (takbull-ipn settles them). Others take the money but never mark the request paid, so they are not offered.
 * `mock` is the dev/CI stand-in.
 */
export const JOB_ONLINE_PAYMENT_PROVIDERS = ['ypay', 'grow', 'takbull', 'mock'] as const;

export function jobOnlinePaymentSupported(paymentProvider: string | null | undefined): boolean {
  return (JOB_ONLINE_PAYMENT_PROVIDERS as readonly string[]).includes(paymentProvider ?? '');
}

/**
 * Rule for changing the payment provider (owner decisions), enforced by the tenants trigger
 * (…_block_payment_provider_switch.sql, loosened by …_provider_switch_until_first_payment.sql):
 *  - before the studio's first real payment it may move freely between the providers in
 *    SWITCH_FREE_PAYMENT_PROVIDERS, in any direction;
 *  - after it, only from paying at the studio with no tax documents ('offline' + 'none') to one
 *    of SWITCH_TARGET_PAYMENT_PROVIDERS, with no invoicing or that provider's own. Anything else
 *    is made by OpalSwift support.
 */
export const SWITCH_TARGET_PAYMENT_PROVIDERS = ['grow', 'ypay', 'invoice4u'] as const;
export const SWITCH_FREE_PAYMENT_PROVIDERS = ['offline', 'grow', 'ypay', 'invoice4u'] as const;

export function paymentProviderSwitchAllowed(
  from: { payment: string | null | undefined; invoicing: string | null | undefined },
  to: { payment: string; invoicing?: string | null },
  /** Whether the studio has taken a real payment yet; unknown counts as yes. */
  hasPayment: boolean | undefined = true,
): boolean {
  if (to.payment === from.payment) return true;
  if (hasPayment === false && (SWITCH_FREE_PAYMENT_PROVIDERS as readonly string[]).includes(to.payment)) {
    return true;
  }
  return (
    from.payment === 'offline' &&
    (from.invoicing ?? 'none') === 'none' &&
    (SWITCH_TARGET_PAYMENT_PROVIDERS as readonly string[]).includes(to.payment) &&
    ['none', to.payment].includes(to.invoicing ?? 'none')
  );
}

/**
 * True when the studio may still choose its payment provider itself: before its first real
 * payment (from one of the offered providers), or while it pays at the studio with no documents.
 * `hasPayment` unknown (still loading) counts as yes.
 */
export function canChoosePaymentProvider(
  tenant: { payment_provider?: string | null; invoicing_provider?: string | null } | null | undefined,
  hasPayment: boolean | undefined = true,
): boolean {
  if (
    hasPayment === false &&
    (SWITCH_FREE_PAYMENT_PROVIDERS as readonly string[]).includes(tenant?.payment_provider ?? '')
  ) {
    return true;
  }
  return tenant?.payment_provider === 'offline' && (tenant?.invoicing_provider ?? 'none') === 'none';
}

/**
 * Providers a studio with monthly fees can use (owner decision): Grow charges a saved card each
 * month and pay at the studio records them by hand. YPay and Invoice4U cannot, so a studio on
 * either cannot create a monthly class (backstop trigger on offerings).
 */
export const MONTHLY_FEE_PAYMENT_PROVIDERS = ['grow', 'offline', 'mock'] as const;

export function monthlyFeesSupported(paymentProvider: string | null | undefined): boolean {
  return (MONTHLY_FEE_PAYMENT_PROVIDERS as readonly string[]).includes(paymentProvider ?? '');
}

/** Pre-filled answer to "Will you charge monthly fees?" by studio type; null = must answer. */
export function monthlyFeesDefaultFor(vertical: string | null | undefined): boolean | null {
  if (vertical === 'dance-studio') return true;
  if (vertical === 'photographer' || vertical === 'beautician') return false;
  return null;
}

/** The database refuses a monthly class for a YPay / Invoice4U studio with this message. */
export function isMonthlyFeesNeedGrowError(error: unknown): boolean {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  return message.includes('monthly_fees_need_grow');
}

/** The database refuses a switch with this message (tenants_guard_payment_provider_switch). */
export const PROVIDER_SWITCH_BLOCKED_ERROR = 'payment_provider_switch_blocked';

export function isProviderSwitchBlockedError(error: unknown): boolean {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  return message.includes(PROVIDER_SWITCH_BLOCKED_ERROR);
}

/**
 * Payment providers that can save a card on an active monthly enrolment through a card link,
 * so later months are charged to it (payments B b). Grow only: YPay has no saved cards, and
 * Invoice4U cannot charge a saved card yet. Mirrors CARD_LINK_PROVIDERS in
 * supabase/functions/_shared/payments/card-link.ts (a test checks the two agree).
 */
export const CARD_LINK_PAYMENT_PROVIDERS = ['grow'] as const;

export function cardLinkSupported(paymentProvider: string | null | undefined): boolean {
  return (CARD_LINK_PAYMENT_PROVIDERS as readonly string[]).includes(paymentProvider ?? '');
}
