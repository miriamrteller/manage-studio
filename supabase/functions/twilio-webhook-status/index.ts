import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req: Request) => {
  // Body fields (MessageSid, MessageStatus, ErrorCode) are not used yet.
  await req.json();

  // TODO: update notification_log with delivery status
  // If failed: trigger retry logic in notification_queue

  return new Response(JSON.stringify({ success: true }));
});
