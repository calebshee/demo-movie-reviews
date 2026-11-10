import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness.ts';

let db: TestDb;

const movie = (id: number, title = `Movie ${id}`) => ({
  id,
  title,
  overview: 'An overview',
  poster_path: `/p${id}.jpg`,
  backdrop_path: null,
  original_language: 'en',
  sg_release_date: '2026-11-01',
  genres: ['Drama', 'Thriller'],
  tmdb_vote_average: 7.4,
  tmdb_vote_count: 120,
});

async function sync(movies: object[]) {
  return db.as('service_role', null, (q) =>
    q('select * from public.sync_now_showing($1::jsonb)', [JSON.stringify(movies)]),
  );
}

async function createUser(meta: Record<string, unknown> = {}, email = 'someone@example.com') {
  const [row] = await db.query(
    'insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id',
    [email, JSON.stringify(meta)],
  );
  return row!.id as string;
}

async function stats(movieId: number) {
  const [row] = await db.query(
    'select review_count, rating_sum, community_rating::text as community_rating from public.movies where id = $1',
    [movieId],
  );
  return row;
}

async function addReview(userId: string, movieId: number, rating: number, body: string | null = null) {
  return db.as('authenticated', userId, (q) =>
    q('insert into public.reviews (movie_id, rating, body) values ($1, $2, $3) returning *', [movieId, rating, body]),
  );
}

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.query('delete from public.reviews; delete from public.movies; delete from auth.users;');
  await sync([movie(1), movie(2)]);
});

describe('profiles', () => {
  it('creates a profile for each new auth user using provider metadata', async () => {
    const id = await createUser({ full_name: '  Ada Lovelace  ' });
    const [p] = await db.query('select display_name from public.profiles where id = $1', [id]);
    expect(p!.display_name).toBe('Ada Lovelace');
  });

  it('never derives the public display name from the email address', async () => {
    const id = await createUser({}, 'secret.person@example.com');
    const [p] = await db.query('select display_name from public.profiles where id = $1', [id]);
    expect(p!.display_name).toMatch(/^Moviegoer [0-9a-f]{6}$/);
    expect(p!.display_name).not.toContain('secret');
  });

  it('lets users rename themselves but not other users', async () => {
    const a = await createUser({ name: 'A' });
    const b = await createUser({ name: 'B' });
    await db.as('authenticated', a, (q) => q("update public.profiles set display_name = 'Alice' where id = $1", [a]));
    const rows = await db.as('authenticated', a, (q) =>
      q("update public.profiles set display_name = 'Hacked' where id = $1 returning id", [b]),
    );
    expect(rows).toHaveLength(0);
    const names = await db.query('select display_name from public.profiles order by display_name');
    expect(names.map((r) => r.display_name)).toEqual(['Alice', 'B']);
  });
});

describe('review aggregates are maintained transactionally', () => {
  it('increments, adjusts and decrements movie stats', async () => {
    const a = await createUser();
    const b = await createUser();

    const [ra] = await addReview(a, 1, 5, 'Loved it');
    await addReview(b, 1, 2);
    expect(await stats(1)).toEqual({ review_count: 2, rating_sum: 7, community_rating: '3.50' });

    await db.as('authenticated', a, (q) => q('update public.reviews set rating = 3 where id = $1', [ra!.id]));
    expect(await stats(1)).toEqual({ review_count: 2, rating_sum: 5, community_rating: '2.50' });

    await db.as('authenticated', a, (q) => q('delete from public.reviews where id = $1', [ra!.id]));
    expect(await stats(1)).toEqual({ review_count: 1, rating_sum: 2, community_rating: '2.00' });

    expect(await stats(2)).toEqual({ review_count: 0, rating_sum: 0, community_rating: null });
  });

  it('rolls back the whole transaction when the second review in it fails', async () => {
    const a = await createUser();
    await expect(
      db.as('authenticated', a, async (q) => {
        await q('insert into public.reviews (movie_id, rating) values (1, 4)');
        await q('insert into public.reviews (movie_id, rating) values (1, 5)'); // duplicate
      }),
    ).rejects.toThrow(/reviews_one_per_user_per_movie/);
    expect(await stats(1)).toEqual({ review_count: 0, rating_sum: 0, community_rating: null });
    expect(await db.query('select * from public.reviews')).toHaveLength(0);
  });

  it('rejects out-of-range ratings and over-long bodies without touching stats', async () => {
    const a = await createUser();
    await expect(addReview(a, 1, 6)).rejects.toThrow(/check/);
    await expect(addReview(a, 1, 0)).rejects.toThrow(/check/);
    await expect(addReview(a, 1, 4, 'x'.repeat(2001))).rejects.toThrow(/check/);
    await expect(addReview(a, 1, 4, '')).rejects.toThrow(/check/);
    await expect(addReview(a, 1, 4, ' \n\t ')).rejects.toThrow(/check/);
    expect(await stats(1)).toEqual({ review_count: 0, rating_sum: 0, community_rating: null });
  });

  it('keeps counts exact under concurrent reviews of the same movie', async () => {
    const users = await Promise.all(Array.from({ length: 20 }, () => createUser()));
    await Promise.all(users.map((u, i) => addReview(u, 1, (i % 5) + 1)));
    // ratings 1..5 four times each => sum 60
    expect(await stats(1)).toEqual({ review_count: 20, rating_sum: 60, community_rating: '3.00' });
  });
});

describe('review permissions', () => {
  it('lets anyone read reviews but not write them anonymously', async () => {
    const a = await createUser();
    await addReview(a, 1, 4);
    const rows = await db.as('anon', null, (q) =>
      q('select r.rating, p.display_name from public.reviews r join public.profiles p on p.id = r.user_id'),
    );
    expect(rows).toHaveLength(1);
    await expect(
      db.as('anon', null, (q) => q('insert into public.reviews (movie_id, rating) values (1, 5)')),
    ).rejects.toThrow(/permission denied/);
  });

  it('stamps reviews with the caller and refuses a spoofed user_id', async () => {
    const a = await createUser();
    const b = await createUser();
    const [row] = await addReview(a, 1, 4);
    expect(row!.user_id).toBe(a);
    await expect(
      db.as('authenticated', a, (q) =>
        q('insert into public.reviews (movie_id, user_id, rating) values (2, $1, 1)', [b]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("stops users editing or deleting someone else's review", async () => {
    const a = await createUser();
    const b = await createUser();
    const [ra] = await addReview(a, 1, 5);
    const updated = await db.as('authenticated', b, (q) =>
      q('update public.reviews set rating = 1 where id = $1 returning id', [ra!.id]),
    );
    const deleted = await db.as('authenticated', b, (q) =>
      q('delete from public.reviews where id = $1 returning id', [ra!.id]),
    );
    expect(updated).toHaveLength(0);
    expect(deleted).toHaveLength(0);
    expect(await stats(1)).toMatchObject({ review_count: 1, rating_sum: 5 });
  });

  it("overrides Supabase's default grants: clients cannot write movies or other users' profiles", async () => {
    const a = await createUser();
    for (const [role, uid] of [['anon', null], ['authenticated', a]] as const) {
      await expect(
        db.as(role, uid, (q) => q("insert into public.movies (id, title, original_language) values (9, 'x', 'en')")),
      ).rejects.toThrow(/permission denied/);
      await expect(db.as(role, uid, (q) => q('delete from public.movies'))).rejects.toThrow(/permission denied/);
    }
    await expect(
      db.as('anon', null, (q) => q("update public.profiles set display_name = 'x'")),
    ).rejects.toThrow(/permission denied/);
  });

  it('does not let users move a review or edit aggregates directly', async () => {
    const a = await createUser();
    const [ra] = await addReview(a, 1, 5);
    await expect(
      db.as('authenticated', a, (q) => q('update public.reviews set movie_id = 2 where id = $1', [ra!.id])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as('authenticated', a, (q) => q('update public.movies set review_count = 999 where id = 1')),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('sync_now_showing', () => {
  it('upserts the current list and retires films that left cinemas, keeping their reviews', async () => {
    const a = await createUser();
    await addReview(a, 1, 4);

    const [result] = await sync([movie(2, 'Movie 2 (renamed)'), movie(3)]);
    expect(result).toEqual({ upserted: 2, retired: 1 });

    const rows = await db.query('select id, title, now_showing, review_count from public.movies order by id');
    expect(rows).toEqual([
      { id: '1', title: 'Movie 1', now_showing: false, review_count: 1 },
      { id: '2', title: 'Movie 2 (renamed)', now_showing: true, review_count: 0 },
      { id: '3', title: 'Movie 3', now_showing: true, review_count: 0 },
    ].map((r) => ({ ...r, id: db.kind === 'pglite' ? Number(r.id) : r.id })));
  });

  it('brings a retired film back when it returns to cinemas without resetting its stats', async () => {
    const a = await createUser();
    await addReview(a, 1, 4);
    await sync([movie(2)]);
    await sync([movie(1), movie(2)]);
    const [row] = await db.query('select now_showing, review_count, rating_sum from public.movies where id = 1');
    expect(row).toEqual({ now_showing: true, review_count: 1, rating_sum: 4 });
  });

  it('refuses an empty list and leaves the table untouched', async () => {
    await expect(sync([])).rejects.toThrow(/empty/);
    const rows = await db.query('select count(*)::int as n from public.movies where now_showing');
    expect(rows[0]!.n).toBe(2);
  });

  it('is atomic: a bad row aborts the whole sync', async () => {
    await expect(sync([movie(3), { ...movie(4), title: null }])).rejects.toThrow(/null/);
    const rows = await db.query('select id from public.movies order by id');
    expect(rows.map((r) => Number(r.id))).toEqual([1, 2]);
  });

  it('cannot be called by anon or signed-in users', async () => {
    const a = await createUser();
    for (const [role, uid] of [['anon', null], ['authenticated', a]] as const) {
      await expect(
        db.as(role, uid, (q) => q('select public.sync_now_showing($1::jsonb)', [JSON.stringify([movie(9)])])),
      ).rejects.toThrow(/permission denied/);
    }
  });
});
