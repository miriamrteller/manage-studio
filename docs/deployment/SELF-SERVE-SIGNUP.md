# Self-serve studio signup (free beta)

"Start free beta" on app.opalswift.com lets a studio owner create their own studio, with no card and no payment. It is **off** until you switch it on.

## How it works

1. **Start.** On app.opalswift.com/create-studio the owner enters their name and email. We email a confirmation link. The email comes from the existing auth email hook and is OpalSwift-branded. The account exists from now on, but it has **no studio and no profile**, so it can't see or change anything.
2. **Confirm.** The link brings them back to /create-studio, signed in. They go through the setup wizard (the same one used at /platform/onboard), in self-serve mode:
   - Studio: name, language, country
   - Type
   - Payments and documents (card providers are connected later in Settings)
   - Colours (OpalSwift default)
   - Address (live availability check; reserved names are refused)
   - Review, with a required checkbox: Terms of Service, DPA and OpalSwift Privacy Policy
3. **Create.** The `provision-studio` Edge Function (action `self_serve`) calls `create_self_serve_studio`. In one transaction, that function:
   - creates the studio
   - makes the account its admin
   - stores the terms acceptance in `legal_acceptances`: version, language, time, IP and browser
4. **Done.** The owner sees the "Next: finish setup" checklist and a **Go to your studio** button. The button signs them in on `https://<address>.opalswift.com`, using the existing `/auth/session-handoff` route.

New studios start as `sub_status = 'trialing'` with no `trial_ends_at`, which means a free beta. Every studio has this status today, with the same features. `tenants.signup_source = 'self_serve'` marks them. Your Studios list on app.opalswift.com shows the source, status and creation date of each studio.

## Server-side rules

The database and the Edge Function enforce these rules. The browser cannot get around them.

- The email must be confirmed (`auth.users.email_confirmed_at`).
- One studio per account. An account that already has a profile is refused: it already has a studio, or it is the platform owner.
- The address must be valid, not reserved (`is_reserved_subdomain`) and not taken.
- The terms must be accepted.
- The service has to be switched on: `SELF_SERVE_SIGNUP_ENABLED=true`.
- If `TURNSTILE_SECRET_KEY` is set, a Turnstile token is required.

## Switch it on

1. **Supabase → Authentication → Sign In / Providers:** "Allow new users to sign up" must be ON (it already is, from the platform-owner setup).
2. **Supabase → Authentication → URL Configuration → Redirect URLs:** keep `https://app.opalswift.com/**`.
3. **Supabase → Edge Functions → Secrets:** add `SELF_SERVE_SIGNUP_ENABLED` = `true`.
4. **GitHub → Settings → Environments → production → Variables:** add `VITE_ENABLE_SELF_SERVE_SIGNUP` = `true`.
5. Run **deploy-prod**.

To switch it off again, set both values to `false` (or delete them) and deploy. Studios that already exist are not affected.

## CAPTCHA (Cloudflare Turnstile)

Turnstile is free, and the project already uses Cloudflare.

1. **Cloudflare → Turnstile → Add widget:**
   - Hostname: `app.opalswift.com`
   - Mode: Managed

   Copy the **site key** and the **secret key**.
2. **Supabase → Edge Functions → Secrets:** `TURNSTILE_SECRET_KEY` = the secret key. From then on, creating a studio needs a passed check (the wizard shows it on the Review step).
3. **Web build:** the site key goes in the production variable `VITE_TURNSTILE_SITE_KEY`. The deploy-web workflow does not pass that variable to the build yet. It needs one line, `VITE_TURNSTILE_SITE_KEY: ${{ vars.VITE_TURNSTILE_SITE_KEY }}` (release lane).

**Do not turn on Supabase → Authentication → Attack Protection → CAPTCHA yet.** Supabase then requires a CAPTCHA token on *every* email sign-in. Studio login, client signup and enrolment codes do not send one yet, so they would stop working. Only the self-serve start page sends a token today. Switch Supabase CAPTCHA on only after those forms send tokens (follow-up).

Until then, abuse is limited by:
- Supabase's own email rate limits (Authentication → Rate Limits)
- the confirmed-email rule
- one studio per account
- reserved names
- the server-side Turnstile check on studio creation
