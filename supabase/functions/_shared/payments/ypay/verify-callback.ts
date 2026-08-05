/**
 * Server-side verification of YPay payment callbacks.
 *
 * Like Invoice4U, YPay callbacks carry **no signature and no shared secret**. The
 * notifyUrl is public and the customer controls their own flow, so a `success=true`
 * POST proves nothing on its own. YPay provides getTransactionsInfo to confirm a
 * transaction server-side; we call it before settling any payment.
 *
 * Unlike Invoice4U's clearing log (which can only be date-range scanned),
 * getTransactionsInfo takes the exact transactionId, so this is a direct lookup.
 *
 * FAIL CLOSED: if the transaction can't be confirmed successful, the payment is not
 * finalised — it stays pending for reconciliation rather than granting access.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getYpayAccessToken, ypayPost } from "./client.ts";
import { getYpayCredentials } from "./credentials.ts";

export type YpayVerification =
  | { verified: true; amountMinor: number | null }
  | { verified: false; reason: string };

/** YPay reports transaction status in `transferstatus`; "S" is settled/success. */
function isSuccessfulStatus(row: Record<string, unknown>): boolean {
  const status = typeof row.transferstatus === "string" ? row.transferstatus.toUpperCase() : "";
  // "S" = success/settled. providercashierstatus "000" is the approved-auth code.
  if (status === "S") return true;
  return String(row.providercashierstatus ?? "") === "000";
}

function amountMinorFromRow(row: Record<string, unknown>): number | null {
  const raw = row.totalamount ?? row.amount;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * Confirms with YPay that `transactionId` really settled successfully.
 * Per-tenant: verification uses the tenant's own credentials.
 */
export async function verifyYpayTransaction(params: {
  service: SupabaseClient;
  tenantId: string;
  transactionId: string;
  expectedAmountMinor?: number;
}): Promise<YpayVerification> {
  const { service, tenantId, transactionId, expectedAmountMinor } = params;

  if (!transactionId) {
    return { verified: false, reason: "callback carried no transactionId to verify" };
  }

  let payload: Record<string, unknown>;
  try {
    const credentials = await getYpayCredentials(service, tenantId);
    const token = await getYpayAccessToken(service, tenantId, credentials);
    payload = await ypayPost("payment/getTransactionsInfo", token, {
      transactionIds: [transactionId],
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { verified: false, reason: `getTransactionsInfo failed: ${reason}` };
  }

  const list = Array.isArray(payload.transactionsInfo)
    ? (payload.transactionsInfo as Record<string, unknown>[])
    : [];
  const row = list.find(
    (r) => String(r.cashierid ?? r.transactionId ?? "") === String(transactionId),
  );

  if (!row) {
    return { verified: false, reason: `no transaction ${transactionId} returned by getTransactionsInfo` };
  }
  if (!isSuccessfulStatus(row)) {
    return { verified: false, reason: `transaction ${transactionId} is not in a successful state` };
  }

  const amountMinor = amountMinorFromRow(row);
  if (expectedAmountMinor !== undefined && amountMinor !== null && amountMinor !== expectedAmountMinor) {
    return {
      verified: false,
      reason: `transaction amount ${amountMinor} does not match expected ${expectedAmountMinor}`,
    };
  }

  return { verified: true, amountMinor };
}
