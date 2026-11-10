// Demo-mode replacement for src/lib/auth.ts. Any email and password sign in;
// nothing leaves the browser. Same exports as the real module.

import type { Session, User } from '@supabase/supabase-js';
import type * as RealAuth from '../lib/auth.ts';
import { validateDisplayName } from '../lib/validation.ts';
import type { DemoUser } from './seed.ts';
import { currentDemoUser, demoState, latency, saveDemoState } from './store.ts';

export const googleAuthEnabled = false;

type Listener = (session: Session | null) => void;
const listeners = new Set<Listener>();

function toSession(u: DemoUser | null): Session | null {
  if (!u) return null;
  const user: User = {
    id: u.id,
    email: u.email,
    aud: 'authenticated',
    app_metadata: { provider: 'demo' },
    user_metadata: { display_name: u.display_name },
    created_at: new Date(0).toISOString(),
  };
  return { access_token: 'demo', refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, user };
}

function setSessionUser(id: string | null) {
  demoState().sessionUserId = id;
  saveDemoState();
  const session = toSession(currentDemoUser());
  listeners.forEach((cb) => cb(session));
}

const findByEmail = (email: string) =>
  demoState().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());

function requireCredentials(email: string, password: string) {
  if (!email.trim() || !password) throw new Error('Enter an email and a password.');
}

/** Same rule as the database trigger: never derive a public name from the email. */
function createUser(email: string, displayName?: string): DemoUser {
  const id = crypto.randomUUID();
  const user = { id, email: email.trim(), display_name: displayName ?? `Moviegoer ${id.slice(0, 6)}` };
  demoState().users.push(user);
  return user;
}

export async function getSession(): Promise<Session | null> {
  return toSession(currentDemoUser());
}

export function onSessionChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function signIn(email: string, password: string): Promise<void> {
  await latency();
  requireCredentials(email, password);
  setSessionUser((findByEmail(email) ?? createUser(email)).id);
}

export async function signUp(email: string, password: string, displayName: string): Promise<{ needsConfirmation: boolean }> {
  await latency();
  requireCredentials(email, password);
  const name = validateDisplayName(displayName);
  if (!name.ok) throw new Error(name.error);
  if (findByEmail(email)) throw new Error('User already registered');
  setSessionUser(createUser(email, name.value).id);
  return { needsConfirmation: false };
}

export async function signInWithGoogle(_returnTo: string): Promise<void> {
  throw new Error('Google sign-in is not available in the demo.');
}

export async function signOut(): Promise<void> {
  setSessionUser(null);
}

export function takeReturnTo(): string | null {
  return null;
}

const conforms = {
  googleAuthEnabled,
  getSession,
  onSessionChange,
  signIn,
  signUp,
  signInWithGoogle,
  signOut,
  takeReturnTo,
} satisfies typeof RealAuth;
void conforms;
