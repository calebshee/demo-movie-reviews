// TMDB access + the pure transforms the sync relies on.
// Docs: https://developer.themoviedb.org/reference/movie-now-playing-list

export const TMDB_BASE = 'https://api.themoviedb.org/3';
export const REGION = 'SG';
/** Films kept: those whose *original* language is English. */
export const ORIGINAL_LANGUAGE = 'en';
/** Language for titles/overviews/genre names in responses (not a filter). */
const RESPONSE_LANGUAGE = 'en-US';
/**
 * now_playing for one region is normally a handful of pages. Exceeding this throws
 * rather than truncating, because a truncated list would retire real films.
 */
export const MAX_PAGES = 30;

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
      if (film.original_language === ORIGINAL_LANGUAGE && !seen.has(film.id)) seen.set(film.id, film);
    }
  }
  return [...seen.values()];
}

// TMDB release types: 2 = theatrical (limited), 3 = theatrical.
const THEATRICAL = new Set([2, 3]);

/**
 * The Singapore theatrical date of the *current* run (YYYY-MM-DD): the latest SG
 * theatrical date on or before `today`, so a re-released classic sorts by its
 * re-release; otherwise the earliest upcoming one (now_playing includes films opening
 * within days). null if TMDB has no SG theatrical date.
 */
export function sgTheatricalDate(res: ReleaseDatesResponse, today: string): string | null {
  const sg = res.results.find((r) => r.iso_3166_1 === REGION);
  const dates = (sg?.release_dates ?? [])
    .filter((d) => THEATRICAL.has(d.type) && d.release_date)
    .map((d) => d.release_date.slice(0, 10))
    .sort();
  const started = dates.filter((d) => d <= today);
  return started.at(-1) ?? dates[0] ?? null;
}

/** Today's date in Singapore as YYYY-MM-DD. */
export const singaporeToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(now);

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
    // Best available date for sorting: TMDB's primary release date when it has no
    // SG-specific one (now_playing?region=SG already established the film is on in SG).
    sg_release_date: sgDate ?? isoDateOrNull(film.release_date),
    genres: film.genre_ids.map((g) => genreNames.get(g)).filter((g): g is string => Boolean(g)),
    tmdb_vote_count: film.vote_count ?? null,
    tmdb_vote_average: film.vote_count > 0 ? Math.round(film.vote_average * 10) / 10 : null,
  };
}

export type Fetch = typeof fetch;

export class TmdbClient {
  private readonly readToken: string;
  private readonly fetchImpl: Fetch;

  /** @param readToken TMDB v4 "API Read Access Token" (sent as a bearer header, never in URLs). */
  constructor(readToken: string | undefined, fetchImpl: Fetch = fetch) {
    if (!readToken) throw new Error('Set TMDB_READ_TOKEN (TMDB → Settings → API → API Read Access Token)');
    this.readToken = readToken;
    this.fetchImpl = fetchImpl;
  }

  async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(TMDB_BASE + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const headers = { accept: 'application/json', authorization: `Bearer ${this.readToken}` };

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

  /**
   * Every page of SG now_playing. Fetched one after another (it is only a few pages)
   * so the result reflects a single walk of the list rather than racing requests.
   */
  async nowPlayingPages(): Promise<NowPlayingPage[]> {
    const pages: NowPlayingPage[] = [];
    for (let page = 1; ; page++) {
      const res = await this.get<NowPlayingPage>('/movie/now_playing', { region: REGION, language: RESPONSE_LANGUAGE, page });
      pages.push(res);
      if (res.total_pages > MAX_PAGES) {
        throw new Error(`now_playing reports ${res.total_pages} pages (limit ${MAX_PAGES}); refusing to sync a truncated list`);
      }
      if (page >= res.total_pages) return pages;
    }
  }

  async genreNames(): Promise<Map<number, string>> {
    const res = await this.get<{ genres: { id: number; name: string }[] }>('/genre/movie/list', { language: RESPONSE_LANGUAGE });
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
export async function fetchNowShowing(client: TmdbClient, today = singaporeToday()): Promise<MovieRow[]> {
  const [pages, genres] = await Promise.all([client.nowPlayingPages(), client.genreNames()]);
  const films = selectEnglishFilms(pages);
  return mapLimit(films, 5, async (film) => {
    const dates = await client.releaseDates(film.id);
    return toMovieRow(film, genres, sgTheatricalDate(dates, today));
  });
}
