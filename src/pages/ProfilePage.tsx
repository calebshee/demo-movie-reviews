import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.tsx';
import { getProfile, updateDisplayName } from '../lib/api.ts';
import { useAsync } from '../lib/useAsync.ts';
import { validateDisplayName } from '../lib/validation.ts';
import { ErrorNotice, Loading } from '../components/Notices.tsx';

export function ProfilePage() {
  const { user, loading } = useAuth();
  const profile = useAsync(() => (user ? getProfile(user.id) : Promise.resolve(null)), [user?.id]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile.status === 'success' && profile.data) setName(profile.data.display_name);
  }, [profile.status, profile.data]);

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" state={{ from: '/profile' }} replace />;
  if (profile.status === 'loading') return <Loading />;
  if (profile.status === 'error') return <ErrorNotice error={profile.error} onRetry={profile.reload} />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const result = validateDisplayName(name);
    if (!result.ok) {
      setMessage({ kind: 'error', text: result.error });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await updateDisplayName(user!.id, result.value);
      setName(result.value);
      setMessage({ kind: 'ok', text: 'Saved. Your reviews now show this name.' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card">
      <h1>Your profile</h1>
      <form onSubmit={onSubmit}>
        <label className="field">
          <span>Display name (public, shown on your reviews)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} required />
        </label>
        {message && (
          <p className={message.kind === 'ok' ? 'form-info' : 'form-error'} role="status">
            {message.text}
          </p>
        )}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </section>
  );
}
