import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

interface OtpEmailPayload {
  email: string;
  code: string;
  expiryMinutes?: number;
  tenantId?: string;
}

interface ResendEmailResponse {
  id: string;
  from: string;
  to: string;
  created_at: string;
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

    const payload: OtpEmailPayload = await req.json();

    // Validate required fields
    if (!payload.email || !payload.code) {
      return new Response(
        JSON.stringify({ error: "Missing email or code" }),
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

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const expiryMinutes = payload.expiryMinutes || 10;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Send OTP email via Resend
    let messageId: string | undefined;
    let emailSendSuccess = false;

    try {
      const emailHtml = generateOtpEmailHtml(payload.code, expiryMinutes);

      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "noreply@manage-studio.app",
          to: payload.email,
          subject: "Your verification code",
          html: emailHtml,
        }),
      });

      if (!resendResponse.ok) {
        const error = await resendResponse.json();
        console.error("Resend error:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message || "Failed to send email",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const result: ResendEmailResponse = await resendResponse.json();
      messageId = result.id;
      emailSendSuccess = true;
    } catch (error) {
      console.error("Email send error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Failed to send email",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Store OTP temporarily (for verification within expiryMinutes)
    if (emailSendSuccess && messageId) {
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
      try {
        await supabase.from("otp_codes").insert({
          email: payload.email,
          code: payload.code,
          message_id: messageId,
          expires_at: expiresAt.toISOString(),
          verified: false,
          created_at: new Date().toISOString(),
        });
      } catch (error) {
        // Log but don't fail - OTP was sent successfully
        console.error("Failed to store OTP:", error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageId,
        expiresInMinutes: expiryMinutes,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("OTP email error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

/**
 * Generate OTP email HTML
 */
function generateOtpEmailHtml(code: string, expiryMinutes: number): string {
  const codeDisplay = code.split("").join(" ");
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2937; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #2563eb; font-size: 24px; margin: 0; }
          .content { margin: 30px 0; }
          .otp-box { 
            background: #2563eb; 
            color: white; 
            padding: 30px; 
            border-radius: 8px; 
            text-align: center;
            margin: 20px 0;
          }
          .otp-code {
            font-size: 48px;
            font-weight: bold;
            letter-spacing: 8px;
            font-family: "Courier New", monospace;
            margin: 10px 0;
            word-break: break-all;
          }
          .fallback { 
            background: #f3f4f6; 
            padding: 15px; 
            border-radius: 4px; 
            text-align: center;
            font-family: "Courier New", monospace;
            font-size: 18px;
            font-weight: bold;
            margin: 15px 0;
          }
          .expiry { color: #ef4444; font-weight: 600; margin: 15px 0; }
          .warning { color: #6b7280; font-size: 12px; margin-top: 20px; }
          .footer { border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Manage Studio</h1>
          </div>
          
          <div class="content">
            <p>Hello,</p>
            <p>To verify your email address, use this code:</p>
            
            <div class="otp-box">
              <p style="margin: 0 0 15px 0; opacity: 0.9; text-transform: uppercase; letter-spacing: 2px; font-size: 12px;">Email Verification</p>
              <div class="otp-code">${codeDisplay}</div>
            </div>
            
            <p>Or copy this code:</p>
            <div class="fallback">${code}</div>
            
            <div class="expiry">⏰ This code expires in ${expiryMinutes} minutes</div>
            
            <p class="warning">If you didn't request this code, please ignore this message. Never share this code with anyone.</p>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} Manage Studio. All rights reserved.</p>
            <p>This is an automated email. Please do not reply directly.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}
