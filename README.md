# SG Screen Reviews

Read and write reviews of **English-language films now showing in Singapore cinemas**.
Anyone can browse; posting, editing or deleting a review requires an account.

## Architecture

```
 GitHub Pages (static)            Supabase                        TMDB
┌────────────────────┐   HTTPS  ┌──────────────────────────┐    ┌──────────┐
│ React SPA (Vite)   │────────▶│ Auth  (email/pw, Google) │    │ now_playing│
│ hash routing       │  anon   │ PostgREST ─▶ Postgres     │    │ region=SG │
└────────────────────┘   key   │   RLS + column grants     │    └────▲─────┘
                               │   triggers / functions    │         │
 GitHub Actions (daily cron) ──▶  rpc sync_now_showing() ◀─┼─ service role key
                               └──────────────────────────┘
```

* **No app server.** GitHub Pages only serves static files, so the browser talks to
  Supabase directly with the public anon key. The database enforces who can do what:
  Row Level Security plus column-level grants (clients cannot set `user_id`, touch
  aggregates, or write to `movies` at all).
* **Transactions live in Postgres.**
  * Each review insert/update/delete fires a trigger that adjusts
    `movies.review_count` / `rating_sum` **in the same transaction**, using relative
    updates so concurrent reviewers never lose an increment. A failed write rolls back
    both.
  * The daily sync calls `sync_now_showing(jsonb)`, which upserts the whole now-showing
    set and retires films that left cinemas in **one transaction**. It refuses an empty
    list so a bad TMDB response can't wipe the home page.
* **"Now showing in Singapore"** = TMDB `/movie/now_playing?region=SG`, filtered to
  `original_language = en`. SG theatrical release dates come from
  `/movie/{id}/release_dates`. This approximates what is in cinemas (TMDB has no
  showtimes), so a film may linger for a few days after its last screening.
* Films that leave cinemas keep their reviews, remain reachable by link and search,
  and can still be reviewed.

| Path | What |
|---|---|
| `supabase/migrations/` | Schema, triggers, sync function, grants, RLS policies |
| `scripts/sync-movies.ts` | Daily TMDB → Supabase sync (run by `.github/workflows/sync-movies.yml`) |
| `src/` | React app (`lib/api.ts` is the only module that talks to Supabase) |
| `tests/db/` | Migration tests: aggregates, rollback, concurrency, RLS, sync |

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. **SQL Editor** → paste and run `supabase/migrations/20261110000000_init.sql`
   (or `npx supabase link && npx supabase db push`).
3. **Authentication → URL Configuration**: set **Site URL** to your Pages URL, e.g.
   `https://<user>.github.io/<repo>/`, and add it (plus `http://localhost:5173/` for
   development) to **Redirect URLs**.
4. Optional: **Authentication → Providers → Google** to enable Google sign-in, then
   set `AUTH_GOOGLE=true` below.
5. **Project Settings → API**: note the project URL, the anon (publishable) key and the
   service role (secret) key.

### 2. TMDB

Create a free account at [themoviedb.org](https://www.themoviedb.org/), then
**Settings → API** and copy the **API Read Access Token**.

### 3. GitHub repository settings

| Kind | Name | Value |
|---|---|---|
| Variable | `SUPABASE_URL` | `https://<ref>.supabase.co` |
| Variable | `SUPABASE_ANON_KEY` | anon / publishable key (public by design) |
| Variable | `AUTH_GOOGLE` | `true` to show Google sign-in (optional) |
| Secret | `SUPABASE_SERVICE_ROLE_KEY` | service role / secret key |
| Secret | `TMDB_READ_TOKEN` | TMDB read access token |

```bash
gh variable set SUPABASE_URL --body "https://<ref>.supabase.co"
gh variable set SUPABASE_ANON_KEY --body "<anon key>"
gh secret set SUPABASE_SERVICE_ROLE_KEY
gh secret set TMDB_READ_TOKEN
```

Then **Settings → Pages → Source: GitHub Actions**, run **Actions → Sync now-showing
films** once by hand, and re-run **Deploy to GitHub Pages**.

## Local development

```bash
npm install
cp .env.example .env   # fill in values
npm run sync           # pull today's films into Supabase (DRY_RUN=1 to preview)
npm run dev            # http://localhost:5173
npm test               # unit + database tests (PGlite, or Postgres via DATABASE_URL)
npm run build
```

Film data from [TMDB](https://www.themoviedb.org/). This product uses the TMDB API but
is not endorsed or certified by TMDB.
