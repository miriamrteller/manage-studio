#!/usr/bin/env node
/**
 * Diagnose Supabase Auth magic-link email delivery for a hosted project.
 *
 * Usage (from repo root):
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   TEST_EMAIL=miriamrstern@gmail.com \
 *   node scripts/check-auth-email-setup.mjs
 *
 * Optional:
 *   APP_CALLBACK_URL=http://localhost:5173/auth/callback
 *   SKIP_SEND=1   # only check user existence + print dashboard checklist
 *
 * Loads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from repo-root .env when set.
 */

import { loadEnv } from './load-env.mjs';

loadEnv();

const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testEmail = process.env.TEST_EMAIL ?? 'miriamrstern@gmail.com';
const appCallbackUrl =
  process.env.APP_CALLBACK_URL ?? 'http://localhost:5173/auth/callback';
const skipSend = process.env.SKIP_SEND === '1';

function logSection(title) {
  console.log(`\n=== ${title} ===`);
}

function printDashboardChecklist() {
  logSection('Dashboard checklist (Auth → URL Configuration)');
  console.log('Site URL: your production app origin (e.g. https://app.example.com)');
  console.log('Redirect URLs must include every callback used by the app:');
  console.log(`  - ${appCallbackUrl}`);
  console.log('  - https://<production-domain>/auth/callback');
  console.log('  - http://127.0.0.1:5173/auth/callback (optional local Vite)');

  logSection('Dashboard checklist (Auth → Providers → Email)');
  console.log('- Email provider enabled');
  console.log('- Confirm email: optional for magic-link login (user can sign in via link)');
  console.log('- Secure email change: recommended ON for production');

  logSection('Dashboard checklist (Auth → Email Templates → Magic Link)');
  console.log('- Template: PKCE app — use TokenHash link + {{ .Token }} (see AUTH_EMAIL_SETUP.md)');
  console.log('- {{ .Token }} for 6-digit Code tab login');
  console.log('- Link: <a href="{{ .ConfirmationURL }}">Sign in</a> (uses redirect_to from the app — not Site URL)');
  console.log('- Site URL must match dev origin (http://localhost:5173) or production domain');

  logSection('Email delivery paths');
  console.log('Path A (dev / quick): Supabase built-in mailer');
  console.log('  - Works for limited testing; may fail on hosted projects without SMTP');
  console.log('  - Local `supabase start`: view mail at http://127.0.0.1:54324 (Inbucket)');
  console.log('');
  console.log('Path B (production): Custom SMTP via Resend');
  console.log('  Auth → SMTP Settings → Enable custom SMTP');
  console.log('  Host: smtp.resend.com | Port: 465 (SSL) or 587 (STARTTLS)');
  console.log('  Username: resend | Password: <RESEND_API_KEY>');
  console.log('  Sender: noreply@your-verified-domain.com');
  console.log('  Verify SPF + DKIM in Resend before go-live');
  console.log('');
  console.log('See docs/deployment/AUTH_EMAIL_SETUP.md for full runbook.');
}

function diagnoseSendError(message) {
  const normalized = (message ?? '').toLowerCase();

  if (normalized.includes('error sending magic link email')) {
    return [
      'Likely cause: Auth mailer cannot send (no custom SMTP on hosted project, or SMTP misconfigured).',
      'Fix: Configure custom SMTP (Resend recommended) in Auth → SMTP Settings.',
      'Also check Auth → Logs for the underlying provider error.',
    ];
  }
  if (normalized.includes('rate limit') || normalized.includes('429')) {
    return [
      'Likely cause: Auth email rate limit exceeded.',
      'Fix: Wait a few minutes, then retry. Review Auth rate limits in dashboard.',
    ];
  }
  if (normalized.includes('redirect') || normalized.includes('url not allowed')) {
    return [
      'Likely cause: Redirect URL not allowlisted.',
      `Fix: Add ${appCallbackUrl} to Auth → URL Configuration → Redirect URLs.`,
    ];
  }
  if (normalized.includes('user not found')) {
    return [
      'Likely cause: No auth.users row for this email.',
      'Fix: Run `pnpm seed:auth-parent` (hosted) or `pnpm db:reset-local` (local).',
    ];
  }

  return [
    'Check Supabase Dashboard → Auth → Logs for the full provider error.',
    'See docs/deployment/AUTH_EMAIL_SETUP.md → Troubleshooting.',
  ];
}

async function adminFetch(path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function main() {
  logSection('Environment');
  if (!url || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    console.error('Add them to repo-root .env (see .env.example) or export in your shell.');
    console.error('SUPABASE_URL can be copied from VITE_SUPABASE_URL in apps/web/.env.local.');
    setTimeout(() => process.exit(1), 0);
    return;
  }

  console.log(`Project URL: ${url}`);
  console.log(`Test email:  ${testEmail}`);
  console.log(`Callback:    ${appCallbackUrl}`);

  logSection('Auth user lookup');
  const { response: listResponse, body: listBody } = await adminFetch(
    `/auth/v1/admin/users?email=${encodeURIComponent(testEmail)}`,
  );

  if (!listResponse.ok) {
    console.error('Failed to query auth users:', listBody.msg ?? listBody.message ?? listResponse.statusText);
    setTimeout(() => process.exit(1), 0);
    return;
  }

  const users = listBody.users ?? [];
  if (users.length === 0) {
    console.log(`No auth.users row for ${testEmail}.`);
    console.log('Run: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm seed:auth-parent');
    console.log('Then re-run supabase/seed.sql (or supabase/scripts/link-parent-user.sql).');
  } else {
    const user = users[0];
    console.log(`Found auth user: ${user.email} (${user.id})`);
    console.log(`Email confirmed: ${user.email_confirmed_at ? 'yes' : 'no'}`);
    console.log(`Last sign in: ${user.last_sign_in_at ?? 'never'}`);
  }

  if (skipSend) {
    printDashboardChecklist();
    return;
  }

  logSection('Magic link send test (same endpoint as Dashboard "Send magic link")');
  const { response: sendResponse, body: sendBody } = await adminFetch('/auth/v1/magiclink', {
    method: 'POST',
    body: JSON.stringify({
      email: testEmail,
      options: {
        redirect_to: appCallbackUrl,
      },
    }),
  });

  if (sendResponse.ok) {
    console.log('SUCCESS: Magic link request accepted by Auth API.');
    console.log('If the inbox is empty, check spam and Auth → Logs for delivery status.');
    console.log('Local dev: open http://127.0.0.1:54324 (Inbucket) after `supabase start`.');
  } else {
    const message = sendBody.msg ?? sendBody.message ?? sendBody.error_description ?? sendResponse.statusText;
    console.error('FAILED:', message);
    console.error('HTTP status:', sendResponse.status);
    console.error('Full response:', JSON.stringify(sendBody, null, 2));

    logSection('Diagnosis');
    for (const line of diagnoseSendError(message)) {
      console.log(`- ${line}`);
    }
  }

  printDashboardChecklist();
}

main().catch((error) => {
  console.error(error);
  setTimeout(() => process.exit(1), 0);
});
