import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Enforce environment variables at initialization
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env.local'
  );
}

/**
 * Supabase client with auto-refresh middleware
 * - Handles session persistence
 * - Auto-refreshes tokens before expiry
 * - No hardcoded secrets in code (all from env vars)
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    // Handled explicitly on /auth/callback to avoid racing PKCE code exchange.
    detectSessionInUrl: false,
  },
});

/**
 * Type-safe session getter
 * Returns null if no session, never throws
 */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn('Failed to get session:', error.message);
    return null;
  }
  return data.session;
}

/**
 * Type-safe auth user getter
 * Extracted from session, used for queries
 */
export async function getAuthUser() {
  const session = await getSession();
  return session?.user || null;
}
