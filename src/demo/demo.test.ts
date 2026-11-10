import { beforeEach, describe, expect, it } from 'vitest';
import * as api from './api.ts';
import * as auth from './auth.ts';
import { resetDemoState } from './store.ts';

const MIDNIGHT_HARBOUR = 9001;
const PAPER_MOONS = 9003;
const LOW_TIDE = 9009; // not showing

beforeEach(async () => {
  resetDemoState();
});

async function signUp(name = 'Tester') {
  await auth.signUp(`${name.toLowerCase()}@example.com`, 'password123', name);
  return (await auth.getSession())!.user.id;
}

describe('browsing', () => {
  it('lists only films now showing, newest release first', async () => {
    const movies = await api.listNowShowing('newest');
    expect(movies.every((m) => m.now_showing)).toBe(true);
    expect(movies.map((m) => m.id)).not.toContain(LOW_TIDE);
    const dates = movies.map((m) => m.sg_release_date!);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('sorts by community rating with unrated films last', async () => {
    const movies = await api.listNowShowing('rating');
    const rated = movies.filter((m) => m.community_rating !== null);
    expect(rated.map((m) => m.community_rating)).toEqual(
      [...rated.map((m) => m.community_rating)].sort((a, b) => b! - a!),
    );
    expect(movies.at(-1)!.community_rating).toBeNull();
  });

  it('search covers films that have left cinemas', async () => {
    const results = await api.searchMovies('low');
    expect(results.map((m) => m.id)).toEqual([LOW_TIDE]);
  });

  it('pages reviews 20 at a time, newest first', async () => {
    const p0 = await api.listReviews(MIDNIGHT_HARBOUR, 0);
    const p1 = await api.listReviews(MIDNIGHT_HARBOUR, 1);
    expect(p0.reviews).toHaveLength(20);
    expect(p0.total).toBeGreaterThan(20);
    expect(p1.reviews).toHaveLength(p0.total - 20);
    const times = [...p0.reviews, ...p1.reviews].map((r) => r.created_at);
    expect([...times].sort().reverse()).toEqual(times);
  });
});

describe('reviews', () => {
  it('requires sign-in to write', async () => {
    await expect(api.createReview(PAPER_MOONS, { rating: 4, body: null })).rejects.toThrow(/log in/);
  });

  it('keeps the community rating in step through create, edit and delete', async () => {
    const before = (await api.getMovie(PAPER_MOONS))!;
    const userId = await signUp();

    await api.createReview(PAPER_MOONS, { rating: 1, body: 'Not for me.' });
    const created = (await api.getMovie(PAPER_MOONS))!;
    expect(created.review_count).toBe(before.review_count + 1);

    const mine = (await api.getMyReview(PAPER_MOONS, userId))!;
    expect(mine.author?.display_name).toBe('Tester');
    await api.updateReview(mine.id, { rating: 5, body: 'Grew on me.' });
    const edited = (await api.getMovie(PAPER_MOONS))!;
    expect(edited.community_rating!).toBeGreaterThan(created.community_rating!);

    await api.deleteReview(mine.id);
    expect(await api.getMovie(PAPER_MOONS)).toEqual(before);
  });

  it('allows one review per user per film', async () => {
    await signUp();
    await api.createReview(PAPER_MOONS, { rating: 4, body: null });
    await expect(api.createReview(PAPER_MOONS, { rating: 5, body: null })).rejects.toThrow(/already reviewed/);
  });

  it("cannot edit or delete someone else's review", async () => {
    await signUp();
    const [theirs] = (await api.listReviews(PAPER_MOONS, 0)).reviews;
    await expect(api.updateReview(theirs!.id, { rating: 1, body: null })).rejects.toThrow(/no longer exists/);
    await api.deleteReview(theirs!.id);
    expect((await api.listReviews(PAPER_MOONS, 0)).reviews.map((r) => r.id)).toContain(theirs!.id);
  });

  it('rejects the same invalid input the database does', async () => {
    await signUp();
    await expect(api.createReview(PAPER_MOONS, { rating: 6, body: null })).rejects.toThrow(/rule/);
    await expect(api.createReview(PAPER_MOONS, { rating: 3, body: '   ' })).rejects.toThrow(/rule/);
  });
});

describe('accounts', () => {
  it('signing in with an unknown email creates an account without exposing the email', async () => {
    await auth.signIn('secret.person@example.com', 'pw');
    const session = (await auth.getSession())!;
    const profile = (await api.getProfile(session.user.id))!;
    expect(profile.display_name).toMatch(/^Moviegoer [0-9a-f]{6}$/);
  });

  it('notifies listeners on sign-in and sign-out', async () => {
    const seen: (string | null)[] = [];
    const off = auth.onSessionChange((s) => seen.push(s?.user.id ?? null));
    const id = await signUp();
    await auth.signOut();
    off();
    expect(seen).toEqual([id, null]);
  });

  it('renames the signed-in user, and the new name shows on their reviews', async () => {
    const id = await signUp();
    await api.createReview(PAPER_MOONS, { rating: 4, body: null });
    await api.updateDisplayName(id, '  Film Buff  ');
    expect((await api.getMyReview(PAPER_MOONS, id))!.author?.display_name).toBe('Film Buff');
  });

  it('rejects a duplicate sign-up', async () => {
    await signUp();
    await auth.signOut();
    await expect(auth.signUp('tester@example.com', 'x', 'Again')).rejects.toThrow(/already registered/);
  });
});
