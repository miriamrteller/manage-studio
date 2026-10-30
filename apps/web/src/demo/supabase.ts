/**
 * Demo replacement for src/lib/supabase.ts. The demo Vite plugin swaps every
 * import of that module for this one, so app code runs unchanged against the
 * in-memory client. Same exports as the real module.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoClient } from './demoClient';

export const supabase = demoClient as unknown as SupabaseClient;

export async function getSession() {
  const { data } = await demoClient.auth.getSession();
  return data.session;
}

export async function getAuthUser() {
  const session = await getSession();
  return session?.user || null;
}
