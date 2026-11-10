// Daily job: pull English-original films now showing in Singapore from TMDB and
// sync them into Supabase in one transaction (public.sync_now_showing).
//
// Env:
//   SUPABASE_URL               https://<project>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  service role / secret key (never shipped to the browser)
//   TMDB_READ_TOKEN            TMDB v4 read access token (or TMDB_API_KEY)
//   DRY_RUN=1                  print what would be synced, write nothing
//
// Run: npm run sync

import { createClient } from '@supabase/supabase-js';
import { TmdbClient, fetchNowShowing } from './lib/tmdb.ts';

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

async function main() {
  const tmdb = new TmdbClient({
    readToken: process.env.TMDB_READ_TOKEN?.trim() || undefined,
    apiKey: process.env.TMDB_API_KEY?.trim() || undefined,
  });

  const movies = await fetchNowShowing(tmdb);
  console.log(`TMDB: ${movies.length} English-language films now showing in SG`);
  if (movies.length === 0) {
    throw new Error('TMDB returned no films; aborting so the site keeps its current list');
  }

  if (process.env.DRY_RUN) {
    for (const m of movies) console.log(`  ${m.sg_release_date ?? '????-??-??'}  ${m.title}`);
    return;
  }

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc('sync_now_showing', { p_movies: movies });
  if (error) throw new Error(`sync_now_showing failed: ${error.message}`);
  const [result] = data as { upserted: number; retired: number }[];
  console.log(`Supabase: upserted ${result?.upserted ?? 0}, retired ${result?.retired ?? 0}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
