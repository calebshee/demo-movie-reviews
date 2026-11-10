import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.tsx';
import { googleAuthEnabled, signIn, signInWithGoogle, signUp } from '../lib/auth.ts';
import { errorMessage } from '../lib/format.ts';
import { DISPLAY_NAME_MAX, validateDisplayName } from '../lib/validation.ts';

type Mode = 'signin' | 'signup';

const COPY: Record<Mode, { title: string; submit: string; autocomplete: string; switchPrompt: string; switchTo: string }> = {
  signin: {
    title: 'Log in',
    submit: 'Log in',
    autocomplete: 'current-password',
    switchPrompt: 'New here?',
    switchTo: 'Create an account',
  },
  signup: {
    title: 'Create an account',
    submit: 'Sign up',
    autocomplete: 'new-password',
    switchPrompt: 'Already have an account?',
    switchTo: 'Log in',
  },
};

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
  const copy = COPY[mode];

  if (user) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        const name = validateDisplayName(displayName);
        if (!name.ok) throw new Error(name.error);
        const { needsConfirmation } = await signUp(email, password, name.value);
        if (needsConfirmation) setInfo('Check your inbox to confirm your email, then log in.');
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not sign you in.'));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    try {
      await signInWithGoogle(from);
    } catch (err) {
      setError(errorMessage(err, 'Could not start Google sign-in.'));
    }
  }

  function switchMode() {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
    setInfo(null);
  }

  return (
    <section className="auth-card">
      <h1>{copy.title}</h1>
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
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={DISPLAY_NAME_MAX}
              required
            />
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
            autoComplete={copy.autocomplete}
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
          {busy ? 'Please wait…' : copy.submit}
        </button>
      </form>

      <p className="switch">
        {copy.switchPrompt}{' '}
        <button type="button" className="link" onClick={switchMode}>
          {copy.switchTo}
        </button>
      </p>
    </section>
  );
}
