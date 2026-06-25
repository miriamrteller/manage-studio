# Manual Operations Runbook

Day-2 operations for manage-studio. For architecture details see [SPEC.md](../SPEC.md).

## Auth & magic-link email

**Primary doc:** [deployment/AUTH_EMAIL_SETUP.md](./deployment/AUTH_EMAIL_SETUP.md)

### Quick triage: magic link not sending

1. Run diagnostic script:
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm auth:check-email
   ```
2. Open Dashboard → **Auth → Logs** — filter `magiclink` and the user's email.
3. If error is `Error sending magic link email`:
   - Configure **Auth → SMTP Settings** (Resend recommended)
   - Verify sender domain in Resend (SPF/DKIM)
4. If user not found:
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm seed:auth-parent
   ```
   Then re-run `supabase/seed.sql` or `supabase/scripts/link-parent-user.sql`.

### Seed parent test user (hosted)

```bash
# 1. Migrations applied through 016
# 2. Create auth.users row
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
pnpm seed:auth-parent

# 3. Sync profiles/families (SQL Editor)
# Run supabase/seed.sql or supabase/scripts/link-parent-user.sql

# 4. Verify
# Run supabase/scripts/verify-seed.sql and verify-auth-setup.sql
```

### Local dev email

```bash
pnpm db:reset-local   # migrations + seed.sql (includes auth user)
pnpm dev
# Magic link emails → http://127.0.0.1:54324 (Inbucket)
```

Test parent login: `miriamrstern@gmail.com` / magic link or password `devpassword123`.

### Redirect URL changes

When adding a new frontend origin, update Dashboard → Auth → URL Configuration:

- Site URL (production)
- Redirect URLs: `https://NEW_ORIGIN/auth/callback`

App code uses `${window.location.origin}/auth/callback` — every origin must be allowlisted.

---

## Database operations

| Task | Command |
| --- | --- |
| Link project | `pnpm db:link` |
| Push migrations | `pnpm db:push` |
| Reset local DB + seed | `pnpm db:reset-local` |
| Regenerate types | `pnpm db:types` |
| Push + types | `pnpm db:sync` |

---

## Edge Function secrets

```bash
supabase secrets set \
  RESEND_API_KEY=re_... \
  NOTIFICATION_FROM_EMAIL="Name <noreply@domain.com>" \
  TWILIO_ACCOUNT_SID=AC... \
  TWILIO_AUTH_TOKEN=... \
  STRIPE_SECRET_KEY=sk_... \
  STRIPE_WEBHOOK_SECRET=whsec_...
```

List secrets (names only): Dashboard → Edge Functions → Secrets.

---

## Email architecture reference

| Path | Purpose | Configuration |
| --- | --- | --- |
| Supabase Auth mailer | Magic-link login/signup | Dashboard SMTP + email templates |
| `send-otp-email` | Enrolment OTP codes | `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL` |
| `send-notification` | Class/transactional notifications | Same Resend secrets |

Do not assume configuring Resend Edge secrets fixes magic-link login — Auth SMTP is separate.

---

## Related docs

- [AUTH_EMAIL_SETUP.md](./deployment/AUTH_EMAIL_SETUP.md)
- [THIRD_PARTY_SERVICES.md](./deployment/THIRD_PARTY_SERVICES.md)
