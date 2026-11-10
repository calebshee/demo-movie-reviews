const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/** Full URLs (demo mode's generated data: posters) pass through; TMDB paths get the CDN prefix. */
const isFullUrl = (path: string) => /^(data:|https?:)/.test(path);

export const posterUrl = (path: string | null, size: 'w342' | 'w500' = 'w342') =>
  path ? (isFullUrl(path) ? path : `${TMDB_IMAGE_BASE}/${size}${path}`) : null;

export const backdropUrl = (path: string | null) => (path ? `${TMDB_IMAGE_BASE}/w1280${path}` : null);

const dateFmt = new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeZone: 'Asia/Singapore' });

/** Formats a YYYY-MM-DD date without shifting it across time zones. */
export function formatReleaseDate(iso: string | null): string {
  if (!iso) return 'Release date TBC';
  const [y, m, d] = iso.split('-').map(Number);
  return dateFmt.format(new Date(Date.UTC(y!, m! - 1, d!)));
}

export const formatTimestamp = (iso: string) => dateTimeFmt.format(new Date(iso));

export const formatRating = (n: number | null) => (n === null ? '–' : n.toFixed(1));

export const reviewCountLabel = (n: number) => `${n.toLocaleString()} review${n === 1 ? '' : 's'}`;

/** Message to show for a caught value of unknown type. */
export const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;
