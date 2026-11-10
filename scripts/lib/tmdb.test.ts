import { describe, expect, it } from 'vitest';
import {
  TmdbClient,
  fetchNowShowing,
  mapLimit,
  selectEnglishFilms,
  sgTheatricalDate,
  toMovieRow,
  type NowPlayingResult,
} from './tmdb.ts';

const film = (id: number, lang = 'en', extra: Partial<NowPlayingResult> = {}): NowPlayingResult => ({
  id,
  title: `Film ${id}`,
  overview: ' Some plot ',
  poster_path: `/p${id}.jpg`,
  backdrop_path: null,
  original_language: lang,
  release_date: '2026-10-20',
  genre_ids: [18, 999],
  vote_average: 7.456,
  vote_count: 10,
  ...extra,
});

describe('selectEnglishFilms', () => {
  it('keeps only English-original films and removes cross-page duplicates', () => {
    const pages = [
      { page: 1, total_pages: 2, results: [film(1), film(2, 'ko'), film(3)] },
      { page: 2, total_pages: 2, results: [film(3), film(4, 'ja'), film(5)] },
    ];
    expect(selectEnglishFilms(pages).map((f) => f.id)).toEqual([1, 3, 5]);
  });
});

describe('sgTheatricalDate', () => {
  it('returns the earliest SG theatrical date, ignoring other countries and digital releases', () => {
    expect(
      sgTheatricalDate({
        results: [
          { iso_3166_1: 'US', release_dates: [{ type: 3, release_date: '2026-09-01T00:00:00.000Z' }] },
          {
            iso_3166_1: 'SG',
            release_dates: [
              { type: 4, release_date: '2026-08-01T00:00:00.000Z' },
              { type: 3, release_date: '2026-11-06T00:00:00.000Z' },
              { type: 2, release_date: '2026-11-02T00:00:00.000Z' },
            ],
          },
        ],
      }),
    ).toBe('2026-11-02');
  });

  it('returns null when TMDB has no SG theatrical date', () => {
    expect(sgTheatricalDate({ results: [] })).toBeNull();
  });
});

describe('toMovieRow', () => {
  const genres = new Map([[18, 'Drama']]);

  it('maps genres, trims overview, rounds the vote and prefers the SG date', () => {
    expect(toMovieRow(film(1), genres, '2026-11-02')).toEqual({
      id: 1,
      title: 'Film 1',
      overview: 'Some plot',
      poster_path: '/p1.jpg',
      backdrop_path: null,
      original_language: 'en',
      sg_release_date: '2026-11-02',
      genres: ['Drama'],
      tmdb_vote_average: 7.5,
      tmdb_vote_count: 10,
    });
  });

  it('falls back to the primary release date and nulls an unrated vote', () => {
    const row = toMovieRow(film(1, 'en', { vote_count: 0, vote_average: 0, overview: '' }), genres, null);
    expect(row.sg_release_date).toBe('2026-10-20');
    expect(row.tmdb_vote_average).toBeNull();
    expect(row.overview).toBeNull();
  });

  it('drops malformed primary release dates', () => {
    expect(toMovieRow(film(1, 'en', { release_date: '' }), genres, null).sg_release_date).toBeNull();
  });
});

describe('mapLimit', () => {
  it('preserves order and never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBe(3);
  });
});

function fakeTmdb(routes: Record<string, unknown>, calls: string[] = []) {
  return (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    const key = url.pathname.replace('/3', '') + (url.searchParams.get('page') ? `?page=${url.searchParams.get('page')}` : '');
    if (!(key in routes)) return new Response('not found', { status: 404 });
    const body = routes[key];
    if (body instanceof Response) return body;
    return Response.json(body);
  }) as typeof fetch;
}

describe('TmdbClient + fetchNowShowing', () => {
  it('walks every page for region SG and builds rows', async () => {
    const calls: string[] = [];
    const fetchImpl = fakeTmdb(
      {
        '/movie/now_playing?page=1': { page: 1, total_pages: 2, results: [film(1), film(2, 'zh')] },
        '/movie/now_playing?page=2': { page: 2, total_pages: 2, results: [film(3)] },
        '/genre/movie/list': { genres: [{ id: 18, name: 'Drama' }] },
        '/movie/1/release_dates': { results: [{ iso_3166_1: 'SG', release_dates: [{ type: 3, release_date: '2026-11-05T00:00:00Z' }] }] },
        '/movie/3/release_dates': { results: [] },
      },
      calls,
    );
    const rows = await fetchNowShowing(new TmdbClient({ readToken: 't' }, fetchImpl));
    expect(rows.map((r) => [r.id, r.sg_release_date])).toEqual([
      [1, '2026-11-05'],
      [3, '2026-10-20'],
    ]);
    expect(calls.filter((c) => c.startsWith('/3/movie/now_playing')).every((c) => c.includes('region=SG'))).toBe(true);
    expect(calls.some((c) => c.includes('/movie/2/'))).toBe(false); // non-English skipped before detail calls
  });

  it('sends the read token as a bearer header, not in the URL', async () => {
    let seen: { url: string; auth: string | null } | undefined;
    const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
      seen = { url: String(input), auth: new Headers(init?.headers).get('authorization') };
      return Response.json({ genres: [] });
    }) as typeof fetch;
    await new TmdbClient({ readToken: 'secret' }, fetchImpl).genreNames();
    expect(seen?.auth).toBe('Bearer secret');
    expect(seen?.url).not.toContain('secret');
  });

  it('fails fast on non-retryable errors', async () => {
    const fetchImpl = fakeTmdb({ '/genre/movie/list': new Response('nope', { status: 401 }) });
    await expect(new TmdbClient({ apiKey: 'k' }, fetchImpl).genreNames()).rejects.toThrow(/HTTP 401/);
  });

  it('retries 429 responses honouring Retry-After', async () => {
    let n = 0;
    const fetchImpl = (async () =>
      ++n === 1
        ? new Response('slow down', { status: 429, headers: { 'retry-after': '0.01' } })
        : Response.json({ genres: [{ id: 1, name: 'Action' }] })) as typeof fetch;
    const genres = await new TmdbClient({ apiKey: 'k' }, fetchImpl).genreNames();
    expect(genres.get(1)).toBe('Action');
    expect(n).toBe(2);
  });

  it('requires credentials', () => {
    expect(() => new TmdbClient({})).toThrow(/TMDB_READ_TOKEN/);
  });
});
