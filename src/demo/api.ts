// Demo-mode replacement for src/lib/api.ts (swapped in by vite.config.ts with
// `--mode demo`). Same exports and the same rules the database enforces: one
// review per user per film, only authors edit/delete, aggregates always in step.

import type { PostgrestError } from '@supabase/supabase-js';
import type * as RealApi from '../lib/api.ts';
import type { HomeSort, Movie, Profile, Review, ReviewDraft } from '../lib/types.ts';
import { REVIEW_BODY_MAX, codePointLength, validateDisplayName } from '../lib/validation.ts';
import type { DemoMovie, DemoReview } from './seed.ts';
import { currentDemoUser, demoState, latency, saveDemoState } from './store.ts';

export const REVIEWS_PAGE_SIZE = 20;

export function friendlyError(error: PostgrestError | Error | null | undefined): string {
  return error?.message || 'Something went wrong.';
}

/** Adds the aggregates the database trigger would maintain. */
function withStats(m: DemoMovie): Movie {
  const ratings = demoState().reviews.filter((r) => r.movie_id === m.id).map((r) => r.rating);
  const sum = ratings.reduce((a, b) => a + b, 0);
  return {
    ...m,
    review_count: ratings.length,
    community_rating: ratings.length ? Math.round((sum / ratings.length) * 100) / 100 : null,
  };
}

const byReleaseDesc = (a: Movie, b: Movie) =>
  (b.sg_release_date ?? '').localeCompare(a.sg_release_date ?? '') || a.title.localeCompare(b.title);

export async function listNowShowing(sort: HomeSort): Promise<Movie[]> {
  await latency();
  const movies = demoState().movies.filter((m) => m.now_showing).map(withStats);
  if (sort === 'newest') return movies.sort(byReleaseDesc);
  return movies.sort(
    (a, b) =>
      (b.community_rating ?? -1) - (a.community_rating ?? -1) ||
      b.review_count - a.review_count ||
      a.title.localeCompare(b.title),
  );
}

export async function searchMovies(term: string): Promise<Movie[]> {
  await latency();
  const needle = term.trim().toLowerCase();
  return demoState()
    .movies.filter((m) => m.title.toLowerCase().includes(needle))
    .map(withStats)
    .sort((a, b) => Number(b.now_showing) - Number(a.now_showing) || byReleaseDesc(a, b))
    .slice(0, 40);
}

export async function getMovie(id: number): Promise<Movie | null> {
  await latency();
  const m = demoState().movies.find((x) => x.id === id);
  return m ? withStats(m) : null;
}

function toReview(r: DemoReview): Review {
  const author = demoState().users.find((u) => u.id === r.user_id);
  return { ...r, author: author ? { display_name: author.display_name } : null };
}

const newestFirst = (a: { created_at: string; id: number }, b: { created_at: string; id: number }) =>
  b.created_at.localeCompare(a.created_at) || b.id - a.id;

export async function listReviews(movieId: number, page: number): Promise<{ reviews: Review[]; total: number }> {
  await latency();
  const all = demoState().reviews.filter((r) => r.movie_id === movieId).sort(newestFirst);
  const from = page * REVIEWS_PAGE_SIZE;
  return { reviews: all.slice(from, from + REVIEWS_PAGE_SIZE).map(toReview), total: all.length };
}

export async function getMyReview(movieId: number, userId: string): Promise<Review | null> {
  await latency();
  const r = demoState().reviews.find((x) => x.movie_id === movieId && x.user_id === userId);
  return r ? toReview(r) : null;
}

function requireUser() {
  const user = currentDemoUser();
  if (!user) throw new Error('Your session has expired. Please log in again.');
  return user;
}

/** Mirrors the reviews table's CHECK constraints. */
function checkDraft(draft: ReviewDraft) {
  if (!Number.isInteger(draft.rating) || draft.rating < 1 || draft.rating > 5 ||
      (draft.body !== null && (codePointLength(draft.body) > REVIEW_BODY_MAX || !/\S/.test(draft.body)))) {
    throw new Error(`That review breaks a rule (rating 1–5, up to ${REVIEW_BODY_MAX.toLocaleString()} characters).`);
  }
}

export async function createReview(movieId: number, draft: ReviewDraft): Promise<void> {
  await latency();
  const user = requireUser();
  checkDraft(draft);
  const s = demoState();
  if (!s.movies.some((m) => m.id === movieId)) throw new Error('That film no longer exists.');
  if (s.reviews.some((r) => r.movie_id === movieId && r.user_id === user.id)) {
    throw new Error("You've already reviewed this film. Edit your existing review instead.");
  }
  const now = new Date().toISOString();
  s.reviews.push({ id: s.nextReviewId++, movie_id: movieId, user_id: user.id, ...draft, created_at: now, updated_at: now });
  saveDemoState();
}

export async function updateReview(reviewId: number, draft: ReviewDraft): Promise<void> {
  await latency();
  const user = requireUser();
  checkDraft(draft);
  // Like RLS: someone else's review simply isn't found.
  const r = demoState().reviews.find((x) => x.id === reviewId && x.user_id === user.id);
  if (!r) throw new Error('That review no longer exists.');
  Object.assign(r, draft, { updated_at: new Date().toISOString() });
  saveDemoState();
}

export async function deleteReview(reviewId: number): Promise<void> {
  await latency();
  const user = requireUser();
  const s = demoState();
  s.reviews = s.reviews.filter((r) => !(r.id === reviewId && r.user_id === user.id));
  saveDemoState();
}

export async function getProfile(userId: string): Promise<Profile | null> {
  await latency();
  const u = demoState().users.find((x) => x.id === userId);
  return u ? { id: u.id, display_name: u.display_name } : null;
}

export async function updateDisplayName(userId: string, displayName: string): Promise<void> {
  await latency();
  const user = requireUser();
  const name = validateDisplayName(displayName);
  if (!name.ok) throw new Error(name.error);
  if (user.id !== userId) throw new Error('Could not find your profile.');
  user.display_name = name.value;
  saveDemoState();
}

// Compile-time check that this module is a drop-in replacement for the real one.
const conforms = {
  REVIEWS_PAGE_SIZE,
  friendlyError,
  listNowShowing,
  searchMovies,
  getMovie,
  listReviews,
  getMyReview,
  createReview,
  updateReview,
  deleteReview,
  getProfile,
  updateDisplayName,
} satisfies typeof RealApi;
void conforms;
