import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session, User } from '@supabase/supabase-js';
import { getSession, onSessionChange, signOut, takeReturnTo } from '../lib/auth.ts';
import { isConfigured } from '../lib/supabase.ts';

interface AuthState {
  session: Session | null;
  user: User | null;
  /** True until the stored session (or an OAuth/email ?code=) has been resolved. */
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Removes ?code=… / ?error=… left by the auth redirect, keeping the hash route. */
function stripAuthParams() {
  const url = new URL(window.location.href);
  const keys = ['code', 'error', 'error_code', 'error_description'];
  if (!keys.some((k) => url.searchParams.has(k))) return;
  keys.forEach((k) => url.searchParams.delete(k));
  window.history.replaceState(window.history.state, '', url.toString());
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isConfigured);
  // Held in a ref so the session bootstrap below runs exactly once.
  const navigate = useRef(useNavigate());

  useEffect(() => {
    if (!isConfigured) return;
    let active = true;
    getSession()
      .then((s) => {
        if (!active) return;
        setSession(s);
        const returnTo = s ? takeReturnTo() : null;
        if (returnTo) navigate.current(returnTo, { replace: true });
      })
      .catch(() => active && setSession(null))
      .finally(() => {
        if (!active) return;
        setLoading(false);
        stripAuthParams();
      });
    const unsubscribe = onSessionChange(setSession);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value: AuthState = { session, user: session?.user ?? null, loading, signOut };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
