import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';

interface TwilioVerifyRequest {
  To: string;
  Channel: 'sms' | 'whatsapp';
  Locale?: string;
}

interface TwilioVerifyResponse {
  sid: string;
  service_sid: string;
  account_sid: string;
  to: string;
  channel: string;
  status: string;
  valid: boolean;
}

function validateIsraeliPhone(phone: string): { valid: boolean; e164?: string } {
  const digits = phone.replace(/\D/g, '');
  
  // Accept: 05XX-XXXXXXX → +972-5XX-XXXXXXX
  if (/^05\d{8}$/.test(digits)) {
    return { valid: true, e164: `+972${digits.slice(1)}` };
  }
  
  // Accept: +9725XX-XXXXXXX
  if (/^\+9725\d{8}$/.test(phone)) {
    return { valid: true, e164: phone };
  }
  
  // Accept: 9725XX-XXXXXXX → +9725XX-XXXXXXX
  if (/^9725\d{8}$/.test(digits)) {
    return { valid: true, e164: `+${digits}` };
  }
  
  return { valid: false };
}

async function callTwilioVerifyAPI(
  sid: string,
  token: string,
  serviceSid: string,
  phoneE164: string,
  channel: 'sms' | 'whatsapp',
): Promise<{ success: boolean; sid?: string; error?: string }> {
  const url = `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`;
  const body = new URLSearchParams({
    To: phoneE164,
    Channel: channel,
    Locale: 'he',
  });

  const authString = btoa(`${sid}:${token}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Twilio error (${response.status}):`, errorBody);
      return { success: false, error: `Twilio API error: ${response.status}` };
    }

    const data: TwilioVerifyResponse = await response.json();
    return { success: true, sid: data.sid };
  } catch (error) {
    console.error('Twilio API call failed:', error);
    return { success: false, error: 'Network error calling Twilio' };
  }
}

async function checkAndIncrementAttempt(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  contactPoint: string,
  channel: 'sms' | 'whatsapp',
): Promise<{ allowed: boolean; blockedUntil?: string; message?: string }> {
  try {
    const { data, error } = await supabase.rpc('increment_verification_attempt', {
      p_tenant_id: tenantId,
      p_contact_point: contactPoint,
      p_channel: channel,
    });

    if (error) {
      console.error('RPC error:', error);
      return { allowed: false, message: 'Database error' };
    }

    const { attempt_count, blocked_until } = data?.[0] || {};

    if (blocked_until && new Date(blocked_until) > new Date()) {
      return {
        allowed: false,
        blockedUntil: blocked_until,
        message: `Rate limited. Try again after ${blocked_until}`,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Attempt check failed:', error);
    return { allowed: false, message: 'Rate limit check failed' };
  }
}

async function logToNotificationLog(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  recipientPhone: string,
  channel: 'sms' | 'whatsapp',
  messageId: string,
  status: 'sent' | 'failed',
  failureReason?: string,
): Promise<void> {
  try {
    await supabase.from('notification_log').insert({
      tenant_id: tenantId,
      recipient_phone: recipientPhone,
      channel,
      template_name: 'otp_code',
      variables: { code_digits: 6 },
      external_msg_id: messageId,
      status,
      failure_reason: failureReason || null,
      created_at: new Date().toISOString(),
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    });
  } catch (error) {
    console.error('Logging failed:', error);
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'method_not_allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const body = await req.json();
    const { recipient_phone, recipient_name, channel, tenant_id } = body;

    // Validate request
    if (!recipient_phone || !recipient_name || !channel || !tenant_id) {
      return new Response(
        JSON.stringify({ error: 'invalid_request', message: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Twilio credentials
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioVerifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    if (!twilioAccountSid || !twilioAuthToken || !twilioVerifyServiceSid) {
      return new Response(
        JSON.stringify({ error: 'send_failed', message: 'Service misconfigured' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Validate phone (Israeli only for V1)
    const phoneValidation = validateIsraeliPhone(recipient_phone);
    if (!phoneValidation.valid || !phoneValidation.e164) {
      return new Response(
        JSON.stringify({
          error: 'invalid_phone',
          message: 'Invalid Israeli phone. Use +972XXX-XXX-XXXX or 05XX-XXX-XXXX format.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const phoneE164 = phoneValidation.e164;

    // Check rate limit
    const attemptCheck = await checkAndIncrementAttempt(supabase, tenant_id, phoneE164, channel);
    if (!attemptCheck.allowed) {
      await logToNotificationLog(supabase, tenant_id, phoneE164, channel, 'rate_limited', 'failed', attemptCheck.message);
      return new Response(
        JSON.stringify({
          error: 'rate_limited',
          message: attemptCheck.message,
          blocked_until: attemptCheck.blockedUntil,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Call Twilio
    const twilioResult = await callTwilioVerifyAPI(
      twilioAccountSid,
      twilioAuthToken,
      twilioVerifyServiceSid,
      phoneE164,
      channel,
    );

    if (!twilioResult.success) {
      await logToNotificationLog(supabase, tenant_id, phoneE164, channel, 'twilio_error', 'failed', twilioResult.error);
      return new Response(
        JSON.stringify({
          error: 'send_failed',
          message: 'SMS service unavailable. Try again in 5 minutes.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Log success
    await logToNotificationLog(supabase, tenant_id, phoneE164, channel, twilioResult.sid!, 'sent');

    return new Response(
      JSON.stringify({
        success: true,
        message_id: twilioResult.sid,
        expires_in_seconds: 600,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'internal_error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
