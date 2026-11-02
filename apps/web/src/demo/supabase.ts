/**
 * Demo replacement for src/lib/supabase.ts. The demo Vite plugin swaps every
 * import of that module for this one, so app code runs unchanged against the
 * in-memory client. Same exports as the real module.
 */
import { demoClient } from './demoClient';

// A live re-export, not `const supabase = demoClient`: app modules that the demo
// handlers import (e.g. lib/query-client → adminDashboardService) load this file
// while demoClient.ts is still initialising. A const copy would read demoClient
// too early (TDZ crash at start-up); the re-export only reads it when called.
export { demoClient as supabase };

export async function getSession() {
  const { data } = await demoClient.auth.getSession();
  return data.session;
}

export async function getAuthUser() {
  const session = await getSession();
  return session?.user || null;
}
