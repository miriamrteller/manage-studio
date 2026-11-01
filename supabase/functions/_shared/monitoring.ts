/**
 * Error reporting for Edge Functions (Sentry, EU region), without the Sentry SDK.
 *
 * Why no SDK: the Deno SDK keeps global state that leaks between requests on a
 * reused worker (Supabase's own guide disables its integrations for that reason),
 * and it adds cold-start time. We only need "send this error", which is a single
 * HTTPS POST to Sentry's envelope endpoint, so this file does exactly that.
 *
 * No-op unless the SENTRY_DSN edge secret is set. Never throws, never blocks a
 * response for more than ~2s. Sends no request/response bodies, headers, or
 * personal data: only the error type, scrubbed message, stack frames, function
 * name and the tags passed in (tenant id etc.). See docs/deployment/OBSERVABILITY.md.
 */
import { jsonResponse } from "./edge-runtime/cors.ts";
import { getEnv } from "./edge-runtime/env.ts";

type Dsn = { envelopeUrl: string; publicKey: string; dsn: string };

export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn.trim());
    const projectId = u.pathname.replace(/^\/+|\/+$/g, "");
    if (u.protocol !== "https:" || !u.username || !/^\d+$/.test(projectId)) return null;
    return {
      envelopeUrl: `https://${u.host}/api/${projectId}/envelope/`,
      publicKey: u.username,
      dsn: dsn.trim(),
    };
  } catch {
    return null;
  }
}

export function isEdgeMonitoringEnabled(): boolean {
  return parseDsn(getEnv("SENTRY_DSN")) !== null;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g;
const URL_QUERY = /(https?:\/\/[^\s"'<>?#]+)[?#][^\s"'<>)]*/g;
const PG_KEY_DETAIL = /Key \(([^)]*)\)=\([^)]*\)/g;
// Long opaque strings (API keys, tokens). UUIDs are kept: they are our ids, not secrets.
const LONG_SECRET = /\b(?![0-9a-f]{8}-[0-9a-f]{4}-)[A-Za-z0-9_-]{32,}\b/g;

/** Masks emails, phones, JWTs, long tokens, URL query strings and Postgres key details. */
export function scrubMessage(text: string): string {
  return text
    .replace(URL_QUERY, "$1")
    .replace(JWT, "[jwt]")
    .replace(EMAIL, "[email]")
    .replace(PG_KEY_DETAIL, "Key ($1)=([redacted])")
    .replace(LONG_SECRET, "[secret]")
    .replace(PHONE, "[number]")
    .slice(0, 2000);
}

type Frame = { function?: string; filename?: string; lineno?: number; colno?: number; in_app?: boolean };

/** Parses V8 stack lines ("at fn (file:line:col)") into Sentry frames, oldest first. */
export function parseStack(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split("\n").slice(1, 51)) {
    const m = line.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/);
    if (!m) continue;
    const filename = m[2].replace(/^file:\/\//, "");
    frames.push({
      function: m[1] || "<anonymous>",
      filename,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !/node_modules|deno\.land|esm\.sh|jsr\.io|ext:/.test(filename),
    });
  }
  return frames.reverse();
}

function normalise(error: unknown): { type: string; message: string; stack?: string } {
  if (error instanceof Error) return { type: error.name || "Error", message: error.message, stack: error.stack };
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    // Supabase/PostgREST error object: keep message only (details can hold row values).
    return { type: "SupabaseError", message: (error as { message: string }).message };
  }
  return { type: "Error", message: typeof error === "string" ? error : "Non-error value thrown" };
}

export type EdgeErrorTags = Record<string, string | number | boolean | null | undefined>;

export function buildEvent(error: unknown, fn: string, tags: EdgeErrorTags = {}) {
  const { type, message, stack } = normalise(error);
  const cleanTags: Record<string, string> = { function: fn };
  for (const [k, v] of Object.entries(tags)) {
    if (v !== undefined && v !== null) cleanTags[k] = scrubMessage(String(v)).slice(0, 200);
  }
  // Set by the Supabase runtime; lets you find the matching lines in Supabase function logs.
  const region = getEnv("SB_REGION");
  if (region) cleanTags.region = region;
  const executionId = getEnv("SB_EXECUTION_ID");
  if (executionId) cleanTags.execution_id = executionId;
  return {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    logger: "edge-function",
    server_name: fn,
    release: getEnv("SENTRY_RELEASE") || undefined,
    environment: getEnv("SENTRY_ENVIRONMENT") || "production",
    tags: cleanTags,
    exception: {
      values: [{ type, value: scrubMessage(message), stacktrace: { frames: parseStack(stack) } }],
    },
  };
}

type Fetch = typeof fetch;

/**
 * Sends one error to Sentry. Resolves (never rejects) within ~2s. Returns the
 * event id, or null when monitoring is off or the send failed.
 */
export async function reportEdgeError(
  error: unknown,
  fn: string,
  tags?: EdgeErrorTags,
  fetchImpl: Fetch = fetch,
): Promise<string | null> {
  const dsn = parseDsn(getEnv("SENTRY_DSN"));
  if (!dsn) return null;
  try {
    const event = buildEvent(error, fn, tags);
    const body = [
      JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString(), dsn: dsn.dsn }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n");
    const res = await fetchImpl(dsn.envelopeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=opalswift-edge/1.0`,
      },
      body,
      signal: AbortSignal.timeout(2000),
    });
    return res.ok ? event.event_id : null;
  } catch (sendError) {
    console.warn("[monitoring] could not send error report", sendError instanceof Error ? sendError.message : "");
    return null;
  }
}

type Handler = (req: Request) => Response | Promise<Response>;

/** Status codes that mean "our bug", not "bad input". */
const REPORTED_STATUS = (status: number) => status >= 500;

/**
 * Wraps a Deno.serve handler: reports unhandled throws (and returns a generic
 * 500 instead of leaking the message), and reports 5xx responses the handler
 * returned itself. Request bodies, headers and query strings are never sent.
 *
 *   Deno.serve(withMonitoring("handle-payment-event", async (req) => { ... }));
 */
export function withMonitoring(fn: string, handler: Handler, fetchImpl: Fetch = fetch): Handler {
  return async (req: Request) => {
    const method = req.method;
    try {
      const res = await handler(req);
      if (REPORTED_STATUS(res.status) && isEdgeMonitoringEnabled()) {
        await reportEdgeError(new Error(`${fn} responded ${res.status}`), fn, {
          method,
          status: res.status,
          kind: "error_response",
        }, fetchImpl);
      }
      return res;
    } catch (error) {
      console.error(`[${fn}] unhandled error`, error);
      await reportEdgeError(error, fn, { method, kind: "unhandled" }, fetchImpl);
      return jsonResponse({ error: "Internal error" }, 500);
    }
  };
}
