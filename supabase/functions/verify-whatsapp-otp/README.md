# Edge Function: verify-whatsapp-otp

Verifies WhatsApp OTP codes via Twilio Verify service.

## Prerequisites

- [ ] Twilio Verify Service SID configured
- [ ] See [Third-Party Services Setup](../../docs/deployment/THIRD_PARTY_SERVICES.md)

## Local testing

```bash
pnpm dlx supabase functions deploy verify-whatsapp-otp --no-verify-jwt
curl -X POST http://localhost:54321/functions/v1/verify-whatsapp-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+972123456789",
    "code": "123456",
    "tenantId": "test-tenant"
  }'
```

## Input validation

Uses `VerifyWhatsAppOtpPayloadSchema` from `@shared/schemas`.
