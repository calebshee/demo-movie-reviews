// Demo-mode replacement for src/lib/supabase.ts: no Supabase project is needed.
import type * as RealSupabase from '../lib/supabase.ts';

export const isConfigured = true;

export function requireSupabase(): never {
  throw new Error('Demo mode has no Supabase client; use the demo api/auth modules.');
}

const conforms = { isConfigured, requireSupabase } satisfies typeof RealSupabase;
void conforms;
