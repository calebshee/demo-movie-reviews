import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.tsx';
import { appBaseUrl, googleAuthEnabled, requireSupabase } from '../lib/supabase.ts';
import { validateDisplayName } from '../lib/validation.ts';

type Mode = 'signin' | 'signup';

export function LoginPage() {
  const { user } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const auth = requireSupabase().auth;
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const name = validateDisplayName(displayName);
        if (!name.ok) throw new Error(name.error);
        const { data, error } = await auth.signUp({
          email,
          password,
          options: { data: { display_name: name.value }, emailRedirectTo: appBaseUrl() },
        });
        if (error) throw error;
        if (!data.session) setInfo('Check your inbox to confirm your email, then log in.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in.');
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    const { error } = await requireSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: appBaseUrl() },
    });
    if (error) setError(error.message);
  }

  return (
    <section className="auth-card">
      <h1>{mode === 'signin' ? 'Log in' : 'Create an account'}</h1>
      <p className="meta">You need an account to post reviews. Reading is open to everyone.</p>

      {googleAuthEnabled && (
        <>
          <button type="button" className="btn wide" onClick={onGoogle}>
            Continue with Google
          </button>
          <p className="divider">
            <span>or</span>
          </p>
        </>
      )}

      <form onSubmit={onSubmit}>
        {mode === 'signup' && (
          <label className="field">
            <span>Display name (shown on your reviews)</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} required />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={mode === 'signup' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="form-info" role="status">
            {info}
          </p>
        )}
        <button type="submit" className="btn primary wide" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Log in' : 'Sign up'}
        </button>
      </form>

      <p className="switch">
        {mode === 'signin' ? 'New here?' : 'Already have an account?'}{' '}
        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
            setInfo(null);
          }}
        >
          {mode === 'signin' ? 'Create an account' : 'Log in'}
        </button>
      </p>
    </section>
  );
}
