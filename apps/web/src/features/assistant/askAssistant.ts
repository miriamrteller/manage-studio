import { supabase } from '@/lib/supabase';
import { parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';

/** Same shapes as supabase/functions/_shared/assistant.ts (AssistantReply). */
export type AssistantPrefill =
  | {
      kind: 'new_shoot';
      clientName?: string;
      clientEmail?: string;
      clientPhone?: string;
      packageName?: string;
      startsAt?: string;
      location?: string;
    }
  | { kind: 'package'; name?: string; price?: string; durationHours?: string };

export interface AssistantReply {
  answer: string;
  guideIds: string[];
  showMe: string | null;
  unknown: boolean;
  unknownReason: 'missing_guide' | 'off_topic' | null;
  prefill: AssistantPrefill | null;
}

export interface AssistantTurn {
  role: 'user' | 'assistant';
  text: string;
}

/** Why there is no reply; each has its own message in assistant.errors.*. */
export type AssistantErrorCode = 'daily_limit' | 'platform_limit' | 'not_configured' | 'feature_off' | 'no_guides' | 'unavailable';

export type AskResult =
  | { ok: true; reply: AssistantReply; remaining: number | null }
  | { ok: false; code: AssistantErrorCode };

const ROUTE_PATTERN = /^\/[A-Za-z0-9/_-]*$/;
const KNOWN: ReadonlySet<string> = new Set(['daily_limit', 'platform_limit', 'not_configured', 'feature_off', 'no_guides']);

/** Asks the studio's question. Read-only: the server never changes anything. */
export async function askAssistant(input: {
  question: string;
  language: 'en' | 'he';
  route: string;
  history: AssistantTurn[];
}): Promise<AskResult> {
  // The server takes a plain path only (no ids from the query string).
  const route = ROUTE_PATTERN.test(input.route) ? input.route.slice(0, 200) : null;
  try {
    const { data, error } = await supabase.functions.invoke('assistant-chat', {
      body: { ...input, route, history: input.history.slice(-12) },
    });
    const body = await parseFunctionInvokeBody(data, error);
    if (!error && body && body.ok === true && body.reply) {
      return {
        ok: true,
        reply: body.reply as AssistantReply,
        remaining: typeof body.remaining === 'number' ? body.remaining : null,
      };
    }
    const code = typeof body?.error === 'string' && KNOWN.has(body.error) ? body.error : 'unavailable';
    return { ok: false, code: code as AssistantErrorCode };
  } catch {
    return { ok: false, code: 'unavailable' };
  }
}
