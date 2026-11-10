// TMDB access + the pure transforms the sync relies on.
// Docs: https://developer.themoviedb.org/reference/movie-now-playing-list

export const TMDB_BASE = 'https://api.themoviedb.org/3';
export const REGION = 'SG';
export const LANGUAGE = 'en';
/** now_playing rarely exceeds ~5 pages for one region; this is just a safety stop. */
export const MAX_PAGES = 10;

export interface NowPlayingResult {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  original_language: string;
  release_date: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
}

export interface NowPlayingPage {
  page: number;
  total_pages: number;
  results: NowPlayingResult[];
}

export interface ReleaseDatesResponse {
  results: { iso_3166_1: string; release_dates: { type: number; release_date: string }[] }[];
}

/** Row shape accepted by public.sync_now_showing(jsonb). */
export interface MovieRow {
  id: number;
  title: string;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  original_language: string;
  sg_release_date: string | null;
  genres: string[];
  tmdb_vote_average: number | null;
  tmdb_vote_count: number | null;
}

/** De-duplicates across pages (TMDB pagination can repeat entries) and keeps English-original films. */
export function selectEnglishFilms(pages: NowPlayingPage[]): NowPlayingResult[] {
  const seen = new Map<number, NowPlayingResult>();
  for (const page of pages) {
    for (const film of page.results) {
      if (film.original_language === LANGUAGE && !seen.has(film.id)) seen.set(film.id, film);
    }
  }
  return [...seen.values()];
}

// TMDB release types: 2 = theatrical (limited), 3 = theatrical.
const THEATRICAL = new Set([2, 3]);

/** Earliest Singapore theatrical release date (YYYY-MM-DD), or null if TMDB has none. */
export function sgTheatricalDate(res: ReleaseDatesResponse): string | null {
  const sg = res.results.find((r) => r.iso_3166_1 === REGION);
  const dates = (sg?.release_dates ?? [])
    .filter((d) => THEATRICAL.has(d.type) && d.release_date)
    .map((d) => d.release_date.slice(0, 10))
    .sort();
  return dates[0] ?? null;
}

const isoDateOrNull = (s: string | undefined | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

export function toMovieRow(
  film: NowPlayingResult,
  genreNames: Map<number, string>,
  sgDate: string | null,
): MovieRow {
  return {
    id: film.id,
    title: film.title,
    overview: film.overview?.trim() || null,
    poster_path: film.poster_path,
    backdrop_path: film.backdrop_path,
    original_language: film.original_language,
    // Fall back to TMDB's primary release date when there is no SG-specific one.
    sg_release_date: sgDate ?? isoDateOrNull(film.release_date),
    genres: film.genre_ids.map((g) => genreNames.get(g)).filter((g): g is string => Boolean(g)),
    tmdb_vote_count: film.vote_count ?? null,
    tmdb_vote_average: film.vote_count > 0 ? Math.round(film.vote_average * 10) / 10 : null,
  };
}

export type Fetch = typeof fetch;

export interface TmdbCredentials {
  /** v4 "API Read Access Token" (preferred). */
  readToken?: string;
  /** v3 API key. */
  apiKey?: string;
}

export class TmdbClient {
  private readonly creds: TmdbCredentials;
  private readonly fetchImpl: Fetch;

  constructor(creds: TmdbCredentials, fetchImpl: Fetch = fetch) {
    if (!creds.readToken && !creds.apiKey) {
      throw new Error('Set TMDB_READ_TOKEN (preferred) or TMDB_API_KEY');
    }
    this.creds = creds;
    this.fetchImpl = fetchImpl;
  }

  async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(TMDB_BASE + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.creds.readToken) headers.authorization = `Bearer ${this.creds.readToken}`;
    else url.searchParams.set('api_key', this.creds.apiKey!);

    for (let attempt = 1; ; attempt++) {
      const res = await this.fetchImpl(url, { headers });
      if (res.ok) return (await res.json()) as T;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= 4) {
        throw new Error(`TMDB ${path} failed: HTTP ${res.status}`);
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
    }
  }

  async nowPlayingPages(): Promise<NowPlayingPage[]> {
    const first = await this.get<NowPlayingPage>('/movie/now_playing', { region: REGION, language: 'en-US', page: 1 });
    const last = Math.min(first.total_pages, MAX_PAGES);
    const rest = await Promise.all(
      Array.from({ length: last - 1 }, (_, i) =>
        this.get<NowPlayingPage>('/movie/now_playing', { region: REGION, language: 'en-US', page: i + 2 }),
      ),
    );
    return [first, ...rest];
  }

  async genreNames(): Promise<Map<number, string>> {
    const res = await this.get<{ genres: { id: number; name: string }[] }>('/genre/movie/list', { language: 'en-US' });
    return new Map(res.genres.map((g) => [g.id, g.name]));
  }

  async releaseDates(movieId: number): Promise<ReleaseDatesResponse> {
    return this.get<ReleaseDatesResponse>(`/movie/${movieId}/release_dates`);
  }
}

/** Runs fn over items with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetches SG now-showing English films and shapes them for sync_now_showing. */
export async function fetchNowShowing(client: TmdbClient): Promise<MovieRow[]> {
  const [pages, genres] = await Promise.all([client.nowPlayingPages(), client.genreNames()]);
  const films = selectEnglishFilms(pages);
  return mapLimit(films, 5, async (film) => {
    const dates = await client.releaseDates(film.id);
    return toMovieRow(film, genres, sgTheatricalDate(dates));
  });
}
