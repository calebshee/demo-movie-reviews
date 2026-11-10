import type { PostgrestError } from '@supabase/supabase-js';
import { requireSupabase } from './supabase.ts';
import type { HomeSort, Movie, Profile, Review } from './types.ts';
import { escapeLike } from './validation.ts';

export const REVIEWS_PAGE_SIZE = 20;

const MOVIE_COLUMNS =
  'id, title, overview, poster_path, backdrop_path, sg_release_date, genres, tmdb_vote_average, tmdb_vote_count, now_showing, review_count, community_rating';
const REVIEW_COLUMNS = 'id, movie_id, user_id, rating, body, created_at, updated_at, author:profiles(display_name)';

/** Turns database errors into messages a user can act on. */
export function friendlyError(error: PostgrestError | Error | null | undefined): string {
  if (!error) return 'Something went wrong.';
  const code = 'code' in error ? error.code : undefined;
  if (code === '23505') return "You've already reviewed this film. Edit your existing review instead.";
  if (code === '23514') return 'That review breaks a rule (rating 1–5, up to 2,000 characters).';
  if (code === '42501' || code === 'PGRST301') return 'Your session has expired. Please log in again.';
  return error.message || 'Something went wrong.';
}

function unwrap<T>(res: { data: T | null; error: PostgrestError | null }): T {
  if (res.error) throw new Error(friendlyError(res.error));
  return res.data as T;
}

// Postgres numeric comes back as a string from PostgREST; normalise it.
function normaliseMovie(m: Movie): Movie {
  return {
    ...m,
    tmdb_vote_average: m.tmdb_vote_average === null ? null : Number(m.tmdb_vote_average),
    community_rating: m.community_rating === null ? null : Number(m.community_rating),
  };
}

export async function listNowShowing(sort: HomeSort): Promise<Movie[]> {
  let q = requireSupabase().from('movies').select(MOVIE_COLUMNS).eq('now_showing', true);
  q =
    sort === 'rating'
      ? q.order('community_rating', { ascending: false, nullsFirst: false }).order('review_count', { ascending: false })
      : q.order('sg_release_date', { ascending: false, nullsFirst: false });
  const rows = unwrap(await q.order('title'));
  return (rows as Movie[]).map(normaliseMovie);
}

/** Searches every film we have ever synced, including ones no longer in cinemas. */
export async function searchMovies(term: string): Promise<Movie[]> {
  const rows = unwrap(
    await requireSupabase()
      .from('movies')
      .select(MOVIE_COLUMNS)
      .ilike('title', `%${escapeLike(term.trim())}%`)
      .order('now_showing', { ascending: false })
      .order('sg_release_date', { ascending: false, nullsFirst: false })
      .limit(40),
  );
  return (rows as Movie[]).map(normaliseMovie);
}

export async function getMovie(id: number): Promise<Movie | null> {
  const row = unwrap(await requireSupabase().from('movies').select(MOVIE_COLUMNS).eq('id', id).maybeSingle());
  return row ? normaliseMovie(row as Movie) : null;
}

export async function listReviews(movieId: number, page: number): Promise<{ reviews: Review[]; total: number }> {
  const from = page * REVIEWS_PAGE_SIZE;
  const res = await requireSupabase()
    .from('reviews')
    .select(REVIEW_COLUMNS, { count: 'exact' })
    .eq('movie_id', movieId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + REVIEWS_PAGE_SIZE - 1);
  const rows = unwrap(res);
  return { reviews: rows as unknown as Review[], total: res.count ?? 0 };
}

export async function getMyReview(movieId: number, userId: string): Promise<Review | null> {
  const row = unwrap(
    await requireSupabase()
      .from('reviews')
      .select(REVIEW_COLUMNS)
      .eq('movie_id', movieId)
      .eq('user_id', userId)
      .maybeSingle(),
  );
  return row as unknown as Review | null;
}

// user_id is filled in by the database from the caller's JWT (column default
// auth.uid()); clients are not even granted the right to set it.
export async function createReview(movieId: number, rating: number, body: string | null): Promise<void> {
  unwrap(await requireSupabase().from('reviews').insert({ movie_id: movieId, rating, body }));
}

export async function updateReview(reviewId: number, rating: number, body: string | null): Promise<void> {
  const rows = unwrap(
    await requireSupabase().from('reviews').update({ rating, body }).eq('id', reviewId).select('id'),
  );
  if ((rows as unknown[]).length === 0) throw new Error('That review no longer exists.');
}

export async function deleteReview(reviewId: number): Promise<void> {
  unwrap(await requireSupabase().from('reviews').delete().eq('id', reviewId));
}

export async function getProfile(userId: string): Promise<Profile | null> {
  return unwrap(
    await requireSupabase().from('profiles').select('id, display_name').eq('id', userId).maybeSingle(),
  ) as Profile | null;
}

export async function updateDisplayName(userId: string, displayName: string): Promise<void> {
  const rows = unwrap(
    await requireSupabase().from('profiles').update({ display_name: displayName }).eq('id', userId).select('id'),
  );
  if ((rows as unknown[]).length === 0) throw new Error('Could not find your profile.');
}
