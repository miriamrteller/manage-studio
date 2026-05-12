# Edge Function: send-otp-email

Sends OTP codes via Resend email service.

## Prerequisites

- [ ] Resend API key configured
- [ ] See [Third-Party Services Setup](../../docs/deployment/THIRD_PARTY_SERVICES.md)

## Local testing

```bash
pnpm dlx supabase functions deploy send-otp-email --no-verify-jwt
curl -X POST http://localhost:54321/functions/v1/send-otp-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "code": "123456",
    "expiryMinutes": 10,
    "tenantId": "test-tenant"
  }'
```

## Input validation

Uses `OtpEmailPayloadSchema` from `@shared/schemas`.
