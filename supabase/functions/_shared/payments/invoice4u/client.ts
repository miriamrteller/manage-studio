/**
 * Invoice4U HTTP client (U2b).
 *
 * One POST helper for every call. All Invoice4U methods share the same conventions,
 * and the failure modes are unusual enough to centralise:
 *
 *  - Method name is a path segment: {base}/{Method}
 *  - Every response is wrapped in a .NET `{ "d": ... }` envelope
 *  - Failures return **HTTP 200** with a populated `Errors[]`, so the HTTP status
 *    alone must never decide success (see response.ts)
 *
 * Base URL comes from INVOICE4U_API_BASE:
 *   QA    https://apiqa.invoice4u.co.il/Services/ApiService.svc
 *   Prod  https://api.invoice4u.co.il/Services/ApiService.svc
 */
import { unwrapInvoice4uOrThrow } from "./response.ts";

const DEFAULT_TIMEOUT_MS = 20_000;

export function invoice4uApiBase(): string {
  const base = Deno.env.get("INVOICE4U_API_BASE")?.trim();
  if (!base) {
    throw new Error(
      "INVOICE4U_API_BASE is not set — expected the QA or production ApiService.svc URL",
    );
  }
  return base.replace(/\/+$/, "");
}

/**
 * True when pointed at the QA host. Sent as `IsQaMode` on clearing requests, and
 * derived from the base URL rather than a separate flag so the two cannot disagree —
 * a request that says IsQaMode while pointed at production is a real-money accident.
 */
export function invoice4uIsQaMode(base = invoice4uApiBase()): boolean {
  return /(^|\/\/)apiqa\./i.test(base);
}

export class Invoice4uApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "Invoice4uApiError";
  }
}

/**
 * POSTs to an Invoice4U method and returns the unwrapped payload.
 * Throws when the transport fails OR when the payload reports errors.
 */
export async function invoice4uPost(
  method: string,
  body: Record<string, unknown>,
  options: { timeoutMs?: number } = {},
): Promise<Record<string, unknown>> {
  const base = invoice4uApiBase();
  const url = `${base}/${method}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Invoice4uApiError(`Invoice4U ${method} request failed: ${reason}`);
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();

  // A non-2xx really is a transport/routing failure — Invoice4U signals business
  // failures with 200 + Errors[], which unwrapInvoice4uOrThrow handles below.
  if (!response.ok) {
    throw new Invoice4uApiError(
      `Invoice4U ${method} returned HTTP ${response.status}: ${text.slice(0, 300)}`,
      response.status,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Invoice4uApiError(
      `Invoice4U ${method} returned non-JSON body: ${text.slice(0, 300)}`,
      response.status,
    );
  }

  return unwrapInvoice4uOrThrow(parsed, method);
}
