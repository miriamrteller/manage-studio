#!/usr/bin/env node
/**
 * Creates the seeded parent auth user on a hosted Supabase project.
 *
 * Usage (from repo root):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-auth-parent.mjs
 *
 * Hosted projects:
 *   1. Apply migrations through 016 (auth trigger)
 *   2. SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-auth-parent.mjs
 *   3. Re-run supabase/seed.sql (or supabase/scripts/link-parent-user.sql if UUID differs)
 */

import { loadEnv } from './load-env.mjs';

loadEnv();

const PARENT_AUTH_USER_ID = '00000000-0000-0000-0000-000000000510';
const PARENT_EMAIL = 'miriamrstern@gmail.com';
const TENANT_SUBDOMAIN = 'creativeballet';

function exitOk(message) {
  console.log(message);
  // Defer exit: immediate process.exit() after fetch crashes libuv on Windows.
  setTimeout(() => process.exit(0), 0);
}

function exitError(message) {
  console.error(message);
  setTimeout(() => process.exit(1), 0);
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    exitError(
      'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in repo-root .env (see .env.example)',
    );
    return;
  }

  const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: PARENT_AUTH_USER_ID,
      email: PARENT_EMAIL,
      email_confirm: true,
      user_metadata: { subdomain: TENANT_SUBDOMAIN },
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = body.msg || body.message || response.statusText;
    if (
      response.status === 422 ||
      message.toLowerCase().includes('already') ||
      message.toLowerCase().includes('registered')
    ) {
      exitOk(`Auth user already exists: ${PARENT_EMAIL} (${PARENT_AUTH_USER_ID})`);
      return;
    }
    exitError(`Failed to create auth user: ${message}`);
    return;
  }

  exitOk(
    `Created auth user: ${body.email ?? PARENT_EMAIL} (${body.id ?? PARENT_AUTH_USER_ID})\n` +
      'Re-run supabase/seed.sql to sync user_profiles and family links if needed.',
  );
}

main().catch((error) => {
  exitError(error instanceof Error ? error.message : String(error));
});
