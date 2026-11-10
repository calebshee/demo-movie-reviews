// All Supabase Auth calls live here; components use these functions (via
// AuthProvider) and never touch the client directly.
import type { Session } from '@supabase/supabase-js';
import { requireSupabase } from './supabase.ts';

export const googleAuthEnabled = import.meta.env.VITE_AUTH_GOOGLE === 'true';

/** Where confirmation emails and OAuth providers send users back to (works under any Pages sub-path). */
const appBaseUrl = () => window.location.origin + window.location.pathname;

/** Resolves the stored session, after supabase-js has exchanged any ?code= in the URL. */
export async function getSession(): Promise<Session | null> {
  const { data } = await requireSupabase().auth.getSession();
  return data.session;
}

/** Subscribes to sign-in / sign-out / token refresh. Returns an unsubscribe function. */
export function onSessionChange(cb: (session: Session | null) => void): () => void {
  const { data } = requireSupabase().auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Returns true when the project requires email confirmation before the first sign-in. */
export async function signUp(email: string, password: string, displayName: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await requireSupabase().auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName }, emailRedirectTo: appBaseUrl() },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

const RETURN_TO_KEY = 'auth.returnTo';

/** In-app route to reopen after an OAuth round trip, which always lands on the app root. */
export function takeReturnTo(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_TO_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
    return path && path.startsWith('/') && !path.startsWith('//') ? path : null;
  } catch {
    return null; // storage blocked: fall back to the home page
  }
}

export async function signInWithGoogle(returnTo: string): Promise<void> {
  try {
    sessionStorage.setItem(RETURN_TO_KEY, returnTo);
  } catch {
    // storage blocked: the user simply lands on the home page
  }
  const { error } = await requireSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: appBaseUrl() },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}
