const IMG = 'https://image.tmdb.org/t/p';

export const posterUrl = (path: string | null, size: 'w185' | 'w342' | 'w500' = 'w342') =>
  path ? `${IMG}/${size}${path}` : null;

export const backdropUrl = (path: string | null) => (path ? `${IMG}/w1280${path}` : null);

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
