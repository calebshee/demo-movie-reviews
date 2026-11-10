// Demo-mode state: the sample dataset plus whatever the visitor adds, kept in
// localStorage so it survives a refresh. Falls back to memory when storage is
// unavailable (private mode, tests).

import { buildSeed, type DemoMovie, type DemoReview, type DemoUser } from './seed.ts';
import { DEMO_STORAGE_KEY } from './storageKey.ts';

export interface DemoState {
  movies: DemoMovie[];
  users: DemoUser[];
  reviews: DemoReview[];
  nextReviewId: number;
  sessionUserId: string | null;
}

let state: DemoState | null = null;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function fresh(): DemoState {
  const seed = buildSeed();
  return { ...seed, nextReviewId: seed.reviews.length + 1, sessionUserId: null };
}

function load(): DemoState | null {
  try {
    const raw = storage()?.getItem(DEMO_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DemoState) : null;
  } catch {
    return null; // corrupt or blocked: start over
  }
}

export function demoState(): DemoState {
  state ??= load() ?? fresh();
  return state;
}

/** Persists the current state. Call after every mutation. */
export function saveDemoState(): void {
  try {
    storage()?.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoState()));
  } catch {
    // storage full or blocked: the demo keeps working in memory
  }
}

/** Back to the sample data, signed out. */
export function resetDemoState(): void {
  state = fresh();
  saveDemoState();
}

export function currentDemoUser(): DemoUser | null {
  const s = demoState();
  return s.users.find((u) => u.id === s.sessionUserId) ?? null;
}

/** Simulated network latency so loading states show as they would against Supabase. */
export const latency = () =>
  new Promise<void>((resolve) => setTimeout(resolve, import.meta.env.MODE === 'test' ? 0 : 180));
