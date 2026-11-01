import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { isStopMessage, isValidTwilioRequest } from "../_shared/twilio-signature.ts";

/**
 * twilio-inbound — PUBLIC webhook for incoming SMS / WhatsApp messages
 * (set as the "A message comes in" URL of the Twilio number / WhatsApp sender).
 *
 * A reply of STOP / הסר opts that phone number out of marketing on that
 * channel, in every studio where it appears (the Twilio sender is shared),
 * and confirms by reply (Communications Law §30A refusal notice).
 * Any other message is acknowledged with an empty TwiML response.
 *
 * Security: the X-Twilio-Signature header is verified with TWILIO_AUTH_TOKEN
 * over TWILIO_INBOUND_WEBHOOK_URL (the exact URL configured in Twilio; set it,
 * because the URL the function sees behind the gateway can differ).
 */

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(message: string): Response {
  const escaped = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
    { headers: { "Content-Type": "text/xml" } },
  );
}

Deno.serve(withMonitoring("twilio-inbound", async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!authToken) {
    console.error("twilio-inbound: TWILIO_AUTH_TOKEN not set");
    return new Response("Not configured", { status: 503 });
  }

  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") params[k] = v;
  }

  const url = Deno.env.get("TWILIO_INBOUND_WEBHOOK_URL")?.trim() || req.url;
  const valid = await isValidTwilioRequest(authToken, url, params, req.headers.get("x-twilio-signature"));
  if (!valid) return new Response("Invalid signature", { status: 403 });

  if (!isStopMessage(params.Body)) {
    return new Response(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
  }

  const from = params.From ?? "";
  const channel = from.startsWith("whatsapp:") ? "whatsapp" : "sms";
  const service = createServiceClient();

  const { data: contacts, error } = await service.rpc("find_contacts_by_phone", { p_phone: from });
  if (error) {
    console.error("twilio-inbound: lookup failed", error.message);
    return new Response("Lookup failed", { status: 500 });
  }

  const rows = ((contacts ?? []) as Array<{ tenant_id: string; person_id: string | null; lead_id: string | null }>)
    .map((c) => ({
      tenant_id: c.tenant_id,
      person_id: c.person_id,
      lead_id: c.lead_id,
      kind: `marketing_${channel}`,
      granted: false,
      wording: `Replied "${(params.Body ?? "").trim().slice(0, 40)}" to a ${channel} message.`,
      source: "sms_reply",
    }));
  if (rows.length > 0) {
    const { error: insertError } = await service.from("consent_records").insert(rows);
    if (insertError) {
      console.error("twilio-inbound: insert failed", insertError.message);
      return new Response("Could not record", { status: 500 });
    }
    const leadIds = rows.map((r) => r.lead_id).filter((id): id is string => !!id);
    if (leadIds.length > 0) {
      await service.from("leads").update({ marketing_consent: false }).in("id", leadIds);
    }
  }

  return twiml("הוסרת מרשימת הדיוור. עדיין יישלחו הודעות שירות. / You have been unsubscribed from marketing. Service messages will continue.");
}));
