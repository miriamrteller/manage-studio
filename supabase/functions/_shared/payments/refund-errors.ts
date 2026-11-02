/**
 * Thrown by a payment adapter when OpalSwift cannot refund through the provider's API (none
 * exists, or it is not switched on yet). The admin refunds in the provider's own dashboard and
 * then records the refund here as manual (process-refund with `manual: true`). Dependency-free
 * so any adapter can throw it (payments audit P2 #14).
 */
export class ManualRefundRequiredError extends Error {
  readonly code = "manual_refund_required";

  constructor(readonly provider: string, message?: string) {
    super(
      message ??
        `${provider} refunds cannot be made from OpalSwift. Refund in the ${provider} dashboard, ` +
          "then record the refund here.",
    );
    this.name = "ManualRefundRequiredError";
  }
}
