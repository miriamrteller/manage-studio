import { withMonitoring } from "../_shared/monitoring.ts";

Deno.serve(withMonitoring("twilio-webhook-status", async (req: Request) => {
  // Body fields (MessageSid, MessageStatus, ErrorCode) are not used yet.
  await req.json();

  // TODO: update notification_log with delivery status
  // If failed: trigger retry logic in notification_queue

  return new Response(JSON.stringify({ success: true }));
}));
