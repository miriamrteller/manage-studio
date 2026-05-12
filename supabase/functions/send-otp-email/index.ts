import "@supabase/functions-js/edge-runtime.d.ts"

interface SendOTPEmailRequest {
  recipient_email: string
  otp_code: string
  recipient_name: string
}

Deno.serve(async (req) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    )
  }

  try {
    const { recipient_email, otp_code, recipient_name } =
      await req.json() as SendOTPEmailRequest

    // Get secrets from environment
    const resendApiKey = Deno.env.get("RESEND_API_KEY")
    const fromEmail = Deno.env.get("NOTIFICATION_FROM_EMAIL")

    if (!resendApiKey || !fromEmail) {
      throw new Error("Missing required environment variables")
    }

    // Build HTML email content
    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Your OTP Code</h2>
            <p>Hi ${recipient_name},</p>
            <p>Your one-time password for Creative Ballet Academy enrollment is:</p>
            <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
              <h1 style="color: #d946a6; font-size: 36px; letter-spacing: 5px; margin: 0;">${otp_code}</h1>
            </div>
            <p>This code expires in 10 minutes. Do not share this code with anyone.</p>
            <p>If you did not request this code, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            <p style="font-size: 12px; color: #666;">Creative Ballet Academy</p>
          </div>
        </body>
      </html>
    `

    // Send email via Resend API
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipient_email,
        subject: "Your OTP Code - Creative Ballet Academy",
        html: htmlContent,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("Resend API error:", data)
      throw new Error(`Failed to send email: ${data.message}`)
    }

    return new Response(
      JSON.stringify({ success: true, message_id: data.id }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    console.error("Error sending OTP email:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/send-otp-email' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
