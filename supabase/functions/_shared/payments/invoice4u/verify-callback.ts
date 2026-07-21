/**
 * Server-side verification of Invoice4U payment callbacks.
 *
 * WHY THIS EXISTS
 * ---------------
 * Invoice4U callbacks carry **no signature and no shared secret** — unlike Grow, which
 * has a pre-shared key (see grow_webhook_secrets). The callback URL is public and the
 * customer sees their own OrderId in the ReturnUrl, so a paying customer can POST a
 * forged `Success=True` for their own order and self-approve an enrolment. Invoice4U's
 * own documentation says to look the payment up before fulfilling it.
 *
 * WHAT THE API ACTUALLY ALLOWS
 * ----------------------------
 * The advice is easier said than done: `GetClearingLogByParams` filters only by
 * FromDate / ToDate / IsSuccess — there is no lookup by PaymentId, ClearingTraceId, or
 * OrderIdClientUsage. So verification fetches a bounded recent window and scans it for
 * the PaymentId from the callback.
 *
 * `GetClearingLogById` would be a direct lookup, but it needs a `clearingLogId` the
 * callback never sends. It is plausible that `ClearingTraceId` *is* that id — confirm
 * during U0-live against a real completed payment, and if so switch to the cheaper
 * direct lookup. See OPEN QUESTION below.
 *
 * FAIL CLOSED
 * -----------
 * If verification cannot confirm a successful charge, the payment is NOT finalised.
 * An unverified payment stays pending and gets reconciled; the alternative is granting
 * access for money that never arrived.
 */
import { invoice4uPost } from "./client.ts";

/** How far back to search. Callbacks arrive within seconds; hours of slack is ample. */
const LOOKBACK_HOURS = 24;

export type ClearingLogMatch = {
  isSuccess: boolean;
  paymentId: string | null;
  amount: number | null;
  errorMessage: string | null;
};

export type VerificationOutcome =
  | { verified: true; match: ClearingLogMatch }
  | { verified: false; reason: string };

function toIsoDate(d: Date): string {
  return d.toISOString();
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
}

/** Clearing-log rows can appear directly or under a wrapper key. */
function extractLogRows(payload: Record<string, unknown>): Record<string, unknown>[] {
  const direct = asRecordArray(payload);
  if (direct.length > 0) return direct;

  for (const key of ["ClearingLogs", "Logs", "Results", "Items"]) {
    const rows = asRecordArray(payload[key]);
    if (rows.length > 0) return rows;
  }
  return [];
}

function readString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (typeof value === "string" && value !== "") return value;
  if (typeof value === "number") return String(value);
  return null;
}

/**
 * Confirms with Invoice4U that `paymentId` really was charged successfully.
 *
 * `apiKey` is the tenant's Invoice4U key — verification is per-tenant, so a callback
 * cannot be validated against some other tenant's terminal.
 */
export async function verifyInvoice4uPaymentSucceeded(params: {
  apiKey: string;
  paymentId: string;
  expectedAmountMinor?: number;
  now?: Date;
}): Promise<VerificationOutcome> {
  const { apiKey, paymentId, expectedAmountMinor } = params;

  if (!paymentId) {
    return { verified: false, reason: "callback carried no PaymentId to verify" };
  }

  const now = params.now ?? new Date();
  const from = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);

  let payload: Record<string, unknown>;
  try {
    payload = await invoice4uPost("GetClearingLogByParams", {
      token: apiKey,
      searchParams: {
        FromDate: toIsoDate(from),
        ToDate: toIsoDate(now),
        IsSuccess: true,
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { verified: false, reason: `clearing-log lookup failed: ${reason}` };
  }

  const rows = extractLogRows(payload);
  const row = rows.find((candidate) => readString(candidate, "PaymentId") === paymentId);

  if (!row) {
    return {
      verified: false,
      reason:
        `no successful clearing log found for PaymentId ${paymentId} ` +
        `within the last ${LOOKBACK_HOURS}h`,
    };
  }

  const isSuccess = row.IsSuccess === true;
  if (!isSuccess) {
    return { verified: false, reason: `clearing log for ${paymentId} is not successful` };
  }

  const amountMajor = typeof row.Amount === "number" ? row.Amount : null;
  const match: ClearingLogMatch = {
    isSuccess,
    paymentId,
    amount: amountMajor,
    errorMessage: readString(row, "ErrorMessage"),
  };

  // Amount is also checked against the pending row in process-callback.ts (D17). This
  // second check compares against what the PROVIDER recorded, which is the number that
  // actually moved — a callback could echo the expected amount while the real charge differed.
  if (expectedAmountMinor !== undefined && amountMajor !== null) {
    const recordedMinor = Math.round(amountMajor * 100);
    if (recordedMinor !== expectedAmountMinor) {
      return {
        verified: false,
        reason:
          `clearing log amount ${recordedMinor} does not match expected ${expectedAmountMinor}`,
      };
    }
  }

  return { verified: true, match };
}

/**
 * OPEN QUESTION (U0-live)
 *
 * Confirm against a real completed sandbox payment:
 *   1. Is `ClearingTraceId` from the callback the same as `clearingLogId`? If so,
 *      replace the window scan with GetClearingLogById — cheaper and race-free.
 *   2. Does GetClearingLogByParams accept IsSuccess:false so failures can be
 *      distinguished from "not found"?
 *   3. What is the actual rows key in the response envelope? extractLogRows() accepts
 *      several shapes because no successful clearing has been recorded yet — no
 *      terminal existed when the U0 fixtures were captured.
 */
