# Edge Function: send-notification

Routes notifications by channel (email, WhatsApp, voice).

## Prerequisites

- [ ] Supabase project linked via `pnpm dlx supabase link`
- [ ] All third-party credentials configured (Twilio, Resend)
- [ ] See [Third-Party Services Setup](../../docs/deployment/THIRD_PARTY_SERVICES.md)

## Local testing

```bash
pnpm dlx supabase functions deploy send-notification --no-verify-jwt
curl -X POST http://localhost:54321/functions/v1/send-notification \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "test-tenant",
    "recipientEmail": "user@example.com",
    "templateName": "welcome",
    "channel": "email"
  }'
```

## Input validation

Uses `NotificationPayloadSchema` from `@shared/schemas`.
