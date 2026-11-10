// Sample data for demo mode. All films, people and reviews are invented.
// Dates are relative to "now" so the demo always looks current.

import type { Movie } from '../lib/types.ts';

export type DemoMovie = Omit<Movie, 'review_count' | 'community_rating'>;

export interface DemoUser {
  id: string;
  email: string;
  display_name: string;
}

export interface DemoReview {
  id: number;
  movie_id: number;
  user_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  updated_at: string;
}

const DAY = 86_400_000;
const daysAgo = (n: number, now: number) => new Date(now - n * DAY).toISOString();
const dateDaysAgo = (n: number, now: number) => daysAgo(n, now).slice(0, 10);

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&apos;');

/** Wraps a title into lines of at most `width` characters. */
function wrap(title: string, width = 14): string[] {
  const lines: string[] = [];
  for (const word of title.split(' ')) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** Generated SVG poster (a data: URI), so the demo needs no images from TMDB. */
export function posterSvg(title: string, hue: number, kicker: string): string {
  const lines = wrap(title);
  const top = 380 - (lines.length - 1) * 36;
  const tspans = lines.map((l, i) => `<tspan x='24' y='${top + i * 36}'>${escapeXml(l)}</tspan>`).join('');
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 450'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='0.3' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${hue},62%,42%)'/>` +
    `<stop offset='1' stop-color='hsl(${(hue + 50) % 360},55%,10%)'/></linearGradient></defs>` +
    `<rect width='300' height='450' fill='url(#g)'/>` +
    `<circle cx='215' cy='120' r='78' fill='hsla(${(hue + 20) % 360},90%,80%,0.22)'/>` +
    `<circle cx='245' cy='95' r='34' fill='hsla(${hue},90%,88%,0.25)'/>` +
    `<text x='24' y='48' font-family='Arial,sans-serif' font-size='13' letter-spacing='3' fill='rgba(255,255,255,0.75)'>${escapeXml(kicker.toUpperCase())}</text>` +
    `<text font-family='Georgia,serif' font-size='32' font-weight='700' fill='#fff'>${tspans}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

interface FilmSpec {
  title: string;
  hue: number;
  genres: string[];
  overview: string;
  releasedDaysAgo: number;
  showing: boolean;
  tmdb: [average: number, votes: number];
}

const FILMS: FilmSpec[] = [
  { title: 'Midnight Harbour', hue: 215, genres: ['Thriller', 'Drama'], releasedDaysAgo: 2, showing: true, tmdb: [7.6, 1840],
    overview: 'A night-shift harbour pilot has until dawn to find out who rerouted a cargo ship into the Singapore Strait.' },
  { title: 'The Cartographer’s Daughter', hue: 32, genres: ['Mystery', 'Adventure'], releasedDaysAgo: 5, showing: true, tmdb: [7.1, 612],
    overview: 'An heirloom map with one island too many sends a reluctant archivist across three countries.' },
  { title: 'Paper Moons', hue: 330, genres: ['Comedy', 'Romance'], releasedDaysAgo: 9, showing: true, tmdb: [6.8, 954],
    overview: 'Two rival origami artists are forced to share a stall at the biggest craft fair of the year.' },
  { title: 'Iron Orchard', hue: 140, genres: ['Science Fiction', 'Action'], releasedDaysAgo: 12, showing: true, tmdb: [7.3, 3120],
    overview: 'On a farming colony run by machines, the last human orchardist notices the trees are learning.' },
  { title: 'A Quiet Season', hue: 45, genres: ['Drama'], releasedDaysAgo: 16, showing: true, tmdb: [7.9, 402],
    overview: 'Three generations of a family spend one monsoon season deciding whether to sell the shophouse.' },
  { title: 'Kingdom of Glass', hue: 190, genres: ['Fantasy', 'Family'], releasedDaysAgo: 19, showing: true, tmdb: [6.5, 2210],
    overview: 'A girl who can hear glass sing must keep her brittle kingdom from shattering.' },
  { title: 'Static Bloom', hue: 285, genres: ['Horror'], releasedDaysAgo: 23, showing: true, tmdb: [6.2, 780],
    overview: 'A radio host starts receiving calls from listeners who say they are calling from next week.' },
  { title: 'Northbound', hue: 165, genres: ['Adventure', 'Drama'], releasedDaysAgo: 27, showing: true, tmdb: [7.0, 530],
    overview: 'Estranged brothers drive a vintage bus from Singapore to Bangkok to scatter their father’s ashes.' },
  { title: 'Low Tide', hue: 205, genres: ['Drama'], releasedDaysAgo: 62, showing: false, tmdb: [7.4, 1290],
    overview: 'A marine biologist returns to the fishing village she left, just as the mudflats begin to vanish.' },
  { title: 'Second Act Sunrise', hue: 15, genres: ['Comedy'], releasedDaysAgo: 80, showing: false, tmdb: [6.1, 860],
    overview: 'A retired stage actor talks his way into a reality TV talent show, and keeps winning.' },
];

const NAMED_USERS: [id: string, name: string][] = [
  ['demo-mei', 'Mei Ling'],
  ['demo-arjun', 'Arjun'],
  ['demo-hannah', 'Hannah T.'],
  ['demo-weijie', 'Wei Jie'],
  ['demo-priya', 'Priya'],
  ['demo-marcus', 'Marcus'],
];

// [film index, user index, rating, body, days ago]
const NAMED_REVIEWS: [number, number, number, string | null, number][] = [
  [0, 0, 5, 'Tense from start to finish.\nThe container-yard chase is worth the ticket alone.', 1],
  [0, 1, 4, null, 1.5],
  [0, 2, 4, 'Solid thriller. A bit long in the middle, but the last 20 minutes fly.', 2],
  [1, 3, 4, 'Gorgeous locations and a puzzle that actually plays fair.', 3],
  [1, 4, 3, 'Enjoyable, though the twist is easy to guess.', 4],
  [2, 0, 4, 'Sweet, funny, and the paper animation sequences are lovely.', 6],
  [2, 5, 3, null, 7],
  [3, 1, 5, 'Best sci-fi I have seen this year. Go for the IMAX screening.', 8],
  [3, 2, 4, 'Big ideas, great sound design.', 9],
  [3, 3, 2, 'Looks amazing but the story lost me halfway.', 10],
  [4, 4, 5, 'Quietly devastating. Bring tissues.', 12],
  [5, 5, 3, 'My kids loved it; I thought it was fine.', 15],
  [6, 0, 2, 'Great premise, not very scary.', 20],
  [8, 2, 4, 'Beautifully shot. Glad I caught it before it left cinemas.', 40],
  [9, 3, 3, null, 60],
];

const SHORT_TAKES = [
  'Worth it.', 'Loved the soundtrack.', null, 'Better than the trailer suggests.', 'Great on the big screen.',
  null, 'Strong cast.', 'Kept me guessing.', null, 'Would watch again.',
];

export interface SeedData {
  movies: DemoMovie[];
  users: DemoUser[];
  reviews: DemoReview[];
}

/** Builds the sample dataset relative to `now`. Deterministic for a given `now`. */
export function buildSeed(now = Date.now()): SeedData {
  const movies: DemoMovie[] = FILMS.map((f, i) => ({
    id: 9001 + i,
    title: f.title,
    overview: f.overview,
    poster_path: posterSvg(f.title, f.hue, f.genres[0]!),
    backdrop_path: null,
    sg_release_date: dateDaysAgo(f.releasedDaysAgo, now),
    genres: f.genres,
    tmdb_vote_average: f.tmdb[0],
    tmdb_vote_count: f.tmdb[1],
    now_showing: f.showing,
  }));

  const users: DemoUser[] = NAMED_USERS.map(([id, name]) => ({ id, email: `${id}@example.invalid`, display_name: name }));
  const reviews: DemoReview[] = [];
  const add = (movie: number, user: string, rating: number, body: string | null, ago: number) => {
    const at = daysAgo(ago, now);
    reviews.push({ id: reviews.length + 1, movie_id: movies[movie]!.id, user_id: user, rating, body, created_at: at, updated_at: at });
  };

  for (const [film, user, rating, body, ago] of NAMED_REVIEWS) add(film, NAMED_USERS[user]![0], rating, body, ago);

  // Enough extra reviews on the first film to show pagination (20 per page).
  for (let i = 0; i < 21; i++) {
    const id = `demo-fan-${i}`;
    users.push({ id, email: `${id}@example.invalid`, display_name: `Moviegoer ${(0x3a1f00 + i * 4099).toString(16).slice(-6)}` });
    add(0, id, [5, 4, 4, 3, 5, 4, 2][i % 7]!, SHORT_TAKES[i % SHORT_TAKES.length]!, 1.6 + i * 0.02);
  }

  return { movies, users, reviews };
}
