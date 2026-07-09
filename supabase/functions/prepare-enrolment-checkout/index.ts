import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import {
  parsePrepareEnrolmentCheckoutBody,
  prepareEnrolmentCheckout,
} from "../_shared/prepare-enrolment-checkout.ts";

serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const parsed = parsePrepareEnrolmentCheckoutBody(await req.json());
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, 400);
    }

    const result = await prepareEnrolmentCheckout(req, parsed.body);
    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status);
    }

    return jsonResponse(result.response);
  } catch (error) {
    console.error("[prepare-enrolment-checkout]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal error" },
      500,
    );
  }
});
