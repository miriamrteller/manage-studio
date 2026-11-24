import Anthropic from "npm:@anthropic-ai/sdk@1.13.0";
import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import {
  AUDIT_ACTION,
  type AssistantRequest,
  buildSystemPrompt,
  buildUserContent,
  DAILY_QUESTION_LIMIT,
  GUIDED_SKINS,
  guideIdsFor,
  parseReply,
  replyJsonSchema,
  requestSchema,
  startOfUtcDay,
} from "../_shared/assistant.ts";

/**
 * assistant-chat — "Ask OpalSwift" for studio admins (phase 1, read-only).
 *
 * Answers a question from the help guides only (_shared/help-guides.ts). It
 * reads no studio data and changes nothing: the reply can name a guide whose
 * guided tour the app runs, and values the app fills into a form, which the
 * admin then checks and submits themselves.
 *
 * Only a signed-in studio admin of a studio with the beta feature
 * 'platform:assistant.help' switched on can call it. The studio comes from the
 * caller's own profile. 20 questions per person per day. Answers are not stored;
 * one audit_log row per question holds token counts only. A real question the
 * guides don't cover is filed in studio_feedback (owner-only) as a guide gap.
 * Needs ANTHROPIC_API_KEY; without it the function answers 503.
 */

/** Haiku by default (owner, 24 Nov 2026): the answers come from a short set of guides. */
const MODEL = "claude-haiku-5-5";
const FEATURE = "platform:assistant.help";
/** Marks the Feedback entries the assistant filed, so they read as guide gaps. */
const GUIDE_GAP_PREFIX = "[Ask OpalSwift: no guide yet] ";

Deno.serve(withMonitoring("assistant-chat", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return jsonResponse({ error: "Missing authorization" }, 401);

  const service = createServiceClient();
  const { data: { user }, error: authError } = await service.auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  const { data: profile } = await service
    .from("user_profiles")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .single();
  const roles = (profile?.role as string[] | null) ?? [];
  if (!profile?.tenant_id || (!roles.includes("tenant_admin") && !roles.includes("super_admin"))) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }
  const tenantId = profile.tenant_id as string;

  // Fails closed: when the features can't be read, no question goes to the model.
  const { data: features, error: featureError } = await service.rpc("get_tenant_features", { p_tenant_id: tenantId });
  if (featureError || !Array.isArray(features)) return jsonResponse({ error: "feature_check_unavailable" }, 503);
  if (!(features as string[]).includes(FEATURE)) return jsonResponse({ error: "feature_off" }, 403);

  let body: AssistantRequest;
  try {
    body = requestSchema.parse(await req.json());
  } catch {
    return jsonResponse({ error: "Invalid payload" }, 400);
  }

  const { data: tenant } = await service.from("tenants").select("skin").eq("id", tenantId).single();
  if (!GUIDED_SKINS.has((tenant?.skin as string | undefined) ?? "")) {
    return jsonResponse({ error: "no_guides" }, 409);
  }

  const { count } = await service
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("actor_id", profile.id)
    .eq("action", AUDIT_ACTION)
    .gte("created_at", startOfUtcDay(new Date()));
  if ((count ?? 0) >= DAILY_QUESTION_LIMIT) {
    return jsonResponse({ error: "daily_limit", limit: DAILY_QUESTION_LIMIT }, 429);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
  if (!apiKey) return jsonResponse({ error: "not_configured" }, 503);

  const language = body.language;
  const guideIds = guideIdsFor(language);
  const history = (body.history ?? []).map((turn) => ({ role: turn.role, content: turn.text }));
  // History must start with the person and alternate; drop anything that doesn't.
  while (history.length && history[0].role !== "user") history.shift();

  const client = new Anthropic({ apiKey });
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: [{ type: "text", text: buildSystemPrompt(language), cache_control: { type: "ephemeral" } }],
      messages: [...history, { role: "user", content: buildUserContent(body.question, body.route) }],
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: replyJsonSchema(guideIds) },
      },
    });
  } catch (err) {
    console.error("assistant-chat: model call failed", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "model_unavailable" }, 502);
  }

  const text = message.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text ?? "";
  const reply = message.stop_reason === "refusal" ? null : parseReply(text, guideIds);

  // Counts toward the limit even when the reply was unusable: the tokens were spent.
  await service.from("audit_log").insert({
    tenant_id: tenantId,
    actor_id: profile.id,
    action: AUDIT_ACTION,
    entity_type: "assistant",
    after_state: {
      model: MODEL,
      language,
      input_tokens: message.usage.input_tokens,
      cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
      output_tokens: message.usage.output_tokens,
      unknown: reply?.unknown ?? true,
      guide_ids: reply?.guideIds ?? [],
      stop_reason: message.stop_reason,
    },
  });

  if (!reply) return jsonResponse({ error: "no_answer" }, 502);

  // A real question the guides don't cover goes to the owner's Feedback inbox, so a guide
  // can be written (owner, 24 Nov 2026). Off-topic or abusive questions are not filed.
  if (reply.unknownReason === "missing_guide") {
    const { error: fileError } = await service.from("studio_feedback").insert({
      tenant_id: tenantId,
      sent_by: profile.id,
      kind: "help",
      message: `${GUIDE_GAP_PREFIX}${body.question}`,
      route: body.route ?? null,
    });
    if (fileError) console.error("assistant-chat: filing the guide gap failed", fileError.message);
  }
  return jsonResponse({ ok: true, reply, remaining: Math.max(0, DAILY_QUESTION_LIMIT - (count ?? 0) - 1) });
}));
