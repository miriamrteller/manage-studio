export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

/**
 * A 500 for an unexpected failure (usually a database error). The details go to
 * the function log only: database messages name tables and columns, so the
 * caller gets the same plain "Internal error" as an unhandled throw.
 */
export function internalError(where: string, err: unknown): Response {
  console.error(`[${where}]`, err);
  return jsonResponse({ error: "Internal error" }, 500);
}
