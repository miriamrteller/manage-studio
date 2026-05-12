import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

interface VerifyOtpPayload {
  phone: string;
  code: string;
  personId?: string;
  familyMemberId?: string;
  tenantId?: string;
}

interface TwilioVerifyResponse {
  sid: string;
  account_sid: string;
  to: string;
  channel: string;
  status: string;
  valid: boolean;
}

serve(async (req: Request) => {
  // CORS headers
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
      },
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload: VerifyOtpPayload = await req.json();

    // Validate required fields
    if (!payload.phone || !payload.code) {
      return new Response(
        JSON.stringify({ error: "Missing phone or code" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate phone format (E.164)
    if (!/^\+\d{1,15}$/.test(payload.phone)) {
      return new Response(
        JSON.stringify({ error: "Invalid phone format (E.164 required)" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate OTP format (6 digits)
    if (!/^\d{6}$/.test(payload.code)) {
      return new Response(
        JSON.stringify({ error: "OTP must be 6 digits" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify OTP via Twilio Verify
    let verificationValid = false;
    let verificationError: string | undefined;

    try {
      const authString = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
      const verifyResponse = await fetch(
        `https://verify.twilio.com/v2/Services/VA${twilioAccountSid.substring(2)}/VerificationCheck`,
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${authString}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            "To": payload.phone,
            "Code": payload.code,
          }).toString(),
        }
      );

      if (!verifyResponse.ok) {
        const error = await verifyResponse.json();
        verificationError = error.message || "Verification failed";
      } else {
        const result: TwilioVerifyResponse = await verifyResponse.json();
        verificationValid = result.status === "approved" && result.valid;
        if (!verificationValid) {
          verificationError = "Invalid code or code expired";
        }
      }
    } catch (error) {
      console.error("Twilio verify error:", error);
      verificationError = error instanceof Error ? error.message : "Verification service error";
    }

    // Update contact_preferences if verification successful and IDs provided
    if (verificationValid && (payload.personId || payload.familyMemberId)) {
      try {
        if (payload.personId) {
          // Update person's contact preferences
          const { data: person } = await supabase
            .from("people")
            .select("contact_preferences_id")
            .eq("id", payload.personId)
            .single();

          if (person?.contact_preferences_id) {
            await supabase
              .from("contact_preferences")
              .update({
                whatsapp_number: payload.phone,
                whatsapp_verified: true,
                updated_at: new Date().toISOString(),
              })
              .eq("id", person.contact_preferences_id);
          }
        } else if (payload.familyMemberId) {
          // Update family member's contact preferences via contact_preferences table
          const { data: familyMember } = await supabase
            .from("family_members")
            .select("contact_preferences_id")
            .eq("id", payload.familyMemberId)
            .single();

          if (familyMember?.contact_preferences_id) {
            await supabase
              .from("contact_preferences")
              .update({
                whatsapp_number: payload.phone,
                whatsapp_verified: true,
                updated_at: new Date().toISOString(),
              })
              .eq("id", familyMember.contact_preferences_id);
          }
        }
      } catch (error) {
        console.error("Failed to update contact preferences:", error);
        // Don't fail verification if update fails - at least verification happened
      }
    }

    // Log verification attempt
    if (payload.tenantId) {
      try {
        await supabase.from("audit_log").insert({
          tenant_id: payload.tenantId,
          actor_id: payload.personId || payload.familyMemberId,
          action: verificationValid ? "whatsapp.verified" : "whatsapp.verification_failed",
          entity_type: "contact_preferences",
          before_state: { phone: payload.phone, verified: false },
          after_state: { phone: payload.phone, verified: verificationValid },
          created_at: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to log verification:", error);
      }
    }

    return new Response(
      JSON.stringify({
        success: verificationValid,
        verified: verificationValid,
        phone: payload.phone,
        error: verificationError,
      }),
      {
        status: verificationValid ? 200 : 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("WhatsApp OTP verification error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        verified: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
