import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
// The anon / publishable key is designed to be public: Row Level Security in
// supabase/migrations decides what it can do. Never put the service role key here.
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isConfigured = Boolean(url && anonKey);

/**
 * null when the build has no Supabase settings (e.g. a fork without secrets); the UI
 * then shows a setup notice instead of failing. Only lib/api.ts and lib/auth.ts use it.
 *
 * PKCE flow returns auth codes in the query string (?code=…), which coexists with
 * the hash-based router; the implicit flow's #access_token=… would collide with it.
 */
const client: SupabaseClient | null = isConfigured
  ? createClient(url!, anonKey!, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!client) throw new Error('Supabase is not configured for this build.');
  return client;
}
