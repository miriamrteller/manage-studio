> **Draft, not legal advice. Have an Israeli lawyer review before publishing.**
> Hebrew version: [05-cookie-storage-notice.he.md](05-cookie-storage-notice.he.md).

# Cookie and Local Storage Notice

Last updated: [[DATE]]

OpalSwift (and every studio site on `*.opalswift.com`) uses **only storage that is needed for the site to work**. There are **no advertising, analytics or social-media trackers**, and no third-party fonts or scripts loaded for tracking. Because of that we do not show a cookie banner; this notice tells you what is stored.

## What is stored on your device

| Name / type | Where | Purpose | How long |
|---|---|---|---|
| `sb-…-auth-token` (and PKCE code verifier) | Local storage | Keeps you signed in (Supabase authentication) | Until you sign out or the session expires |
| `language` | Local storage | Remembers your chosen language (Hebrew/English) | Until you clear it |
| `nav-drawer-pinned`, `dashboard-layout-…`, `settings-draft-…` | Local storage | Admin screen preferences and unsaved settings drafts (never passwords or secrets) | Until you clear it / save the form |
| `enrolment-resume:…`, `enrollmentIntent`, `enrolmentResumeKey`, `portalEngagementId` | Session storage | Lets you continue an enrolment after signing in | Until you close the tab |
| `manageStudio.authCallbackUrl`, `gcal-oauth-done:…` | Session storage | Returns you to the right page after sign-in / Google Calendar connection | Until you close the tab |

## Third parties on payment pages

When you pay, the payment form is provided by the studio's payment provider (for example Grow/Meshulam in an embedded frame, YPay, or Stripe). That provider may set its own cookies for security and fraud prevention on its form. Stripe's script, if the studio uses Stripe, sets fraud-prevention cookies. These are governed by the provider's own policy.

Our hosting provider, Cloudflare, may set a strictly necessary security cookie (for example for bot protection) ([[CHECK Cloudflare dashboard: whether Bot Fight Mode / `__cf_bm` is active]]).

## Your choices

You can clear local and session storage and cookies in your browser settings. If you do, you will be signed out and preferences reset.

If we ever add analytics or marketing tools, we will update this notice and ask for your consent first where required.

---

### How this was checked
Code review of `apps/web` on [[DATE OF REVIEW — 2026-11-01]]: no analytics or tracking packages in `package.json`; fonts are self-hosted (`@fontsource/*`, no Google Fonts requests); `src/lib/monitoring.ts` has an optional Sentry hook that is **not installed** (if `VITE_SENTRY_DSN` is ever set and Sentry is added, update this notice and the sub-processor list). Storage keys listed above come from `src/lib/supabase.ts`, `src/contexts/LanguageContext.tsx`, `src/components/**`, `src/features/enrolment/lib/*`, `src/lib/authCallback.ts`, `src/pages/GoogleCalendarCallbackPage.tsx`.

### Sources relied on
- Israel has no cookie-specific statute. Collecting personal data through storage is governed by the Privacy Protection Law 5741-1981 (as amended by Amendment 13), §11 (notice when collecting). *Verify with lawyer whether any Privacy Protection Authority guidance on cookies/tracking applies.*
