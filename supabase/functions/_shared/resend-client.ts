/** Resend HTTP client (no React Email — safe for send-auth-email in Deno). */

export async function sendHtmlEmail(options: {
  to: string;
  from: string;
  subject: string;
  html: string;
}): Promise<{ id: string }> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to send email via Resend");
  }

  return { id: data.id as string };
}
