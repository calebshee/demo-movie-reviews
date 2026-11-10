-- SG Movie Reviews: initial schema.
--
-- Design notes
-- * movies are owned by the daily TMDB sync (service role only). Clients can read them.
-- * reviews are written directly by signed-in users through PostgREST; Row Level
--   Security + column-level grants decide what they may touch.
-- * Every multi-row write happens inside one transaction:
--     - a review insert/update/delete and the movie's aggregate (review_count,
--       rating_sum) are updated by an AFTER trigger in the same transaction, using
--       relative updates so concurrent reviews never lose an increment;
--     - the TMDB sync upserts the whole now-showing set and retires films that left
--       cinemas in a single function call (one transaction, all-or-nothing).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.movies (
  id                bigint primary key,                 -- TMDB movie id
  title             text not null,
  overview          text,
  poster_path       text,
  backdrop_path     text,
  original_language text not null,
  sg_release_date   date,
  genres            text[] not null default '{}',
  tmdb_vote_average numeric(3, 1),
  tmdb_vote_count   integer,
  now_showing       boolean not null default false,
  review_count      integer not null default 0 check (review_count >= 0),
  rating_sum        integer not null default 0 check (rating_sum >= 0),
  community_rating  numeric(3, 2) generated always as (
    case when review_count = 0 then null
         else round(rating_sum::numeric / review_count, 2) end
  ) stored,
  last_synced_at    timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index movies_now_showing_release_idx
  on public.movies (now_showing, sg_release_date desc nulls last);

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (display_name = btrim(display_name) and char_length(display_name) between 1 and 50),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.reviews (
  id         bigint generated always as identity primary key,
  movie_id   bigint not null references public.movies (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  body       text check (body is null or char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_one_per_user_per_movie unique (user_id, movie_id)
);

create index reviews_movie_recent_idx on public.reviews (movie_id, created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger reviews_touch_updated_at before update on public.reviews
  for each row execute function public.touch_updated_at();

-- Keeps movies.review_count / rating_sum in step with reviews, inside the same
-- transaction as the review write. Relative updates take a row lock on the movie,
-- so concurrent writers serialise on that row instead of overwriting each other.
create function public.apply_review_stats() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.movies
       set review_count = review_count + 1,
           rating_sum   = rating_sum + new.rating
     where id = new.movie_id;
  elsif tg_op = 'UPDATE' then
    if new.movie_id <> old.movie_id or new.user_id <> old.user_id then
      raise exception 'review movie_id and user_id are immutable';
    end if;
    update public.movies
       set rating_sum = rating_sum - old.rating + new.rating
     where id = new.movie_id;
  else -- DELETE
    update public.movies
       set review_count = review_count - 1,
           rating_sum   = rating_sum - old.rating
     where id = old.movie_id;
  end if;
  return null;
end;
$$;

create trigger reviews_apply_stats
  after insert or update or delete on public.reviews
  for each row execute function public.apply_review_stats();

-- Creates a profile for every new auth user. Never derives the name from the email
-- address, because display names are public.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(btrim(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      'Moviegoer ' || left(new.id::text, 6)
    )), 50)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- TMDB sync (called by the scheduled GitHub Action with the service role key)
-- ---------------------------------------------------------------------------

-- p_movies: JSON array of now-showing films. Upserts them, flags them now_showing,
-- and flags every other film as no longer showing. Review aggregates are never
-- touched by the sync. Runs as one transaction: a failure leaves the table as it was.
create function public.sync_now_showing(p_movies jsonb)
returns table (upserted integer, retired integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_upserted integer;
  v_retired  integer;
begin
  if p_movies is null or jsonb_typeof(p_movies) <> 'array' then
    raise exception 'p_movies must be a JSON array';
  end if;
  -- An empty list almost certainly means the upstream API misbehaved; refusing it
  -- stops one bad run from emptying the home page.
  if jsonb_array_length(p_movies) = 0 then
    raise exception 'refusing to sync an empty now-showing list';
  end if;

  insert into public.movies as m (
    id, title, overview, poster_path, backdrop_path, original_language,
    sg_release_date, genres, tmdb_vote_average, tmdb_vote_count,
    now_showing, last_synced_at
  )
  select r.id, r.title, r.overview, r.poster_path, r.backdrop_path, r.original_language,
         r.sg_release_date, coalesce(r.genres, '{}'), r.tmdb_vote_average, r.tmdb_vote_count,
         true, now()
    from jsonb_to_recordset(p_movies) as r (
      id bigint, title text, overview text, poster_path text, backdrop_path text,
      original_language text, sg_release_date date, genres text[],
      tmdb_vote_average numeric, tmdb_vote_count integer
    )
  on conflict (id) do update set
    title             = excluded.title,
    overview          = excluded.overview,
    poster_path       = excluded.poster_path,
    backdrop_path     = excluded.backdrop_path,
    original_language = excluded.original_language,
    sg_release_date   = excluded.sg_release_date,
    genres            = excluded.genres,
    tmdb_vote_average = excluded.tmdb_vote_average,
    tmdb_vote_count   = excluded.tmdb_vote_count,
    now_showing       = true,
    last_synced_at    = now();
  get diagnostics v_upserted = row_count;

  update public.movies
     set now_showing = false
   where now_showing
     and id not in (select (e ->> 'id')::bigint from jsonb_array_elements(p_movies) as e);
  get diagnostics v_retired = row_count;

  return query select v_upserted, v_retired;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Supabase grants broad table privileges to anon/authenticated by default. Start from
-- nothing and grant only what the app needs; column lists stop clients from writing
-- user_id, aggregates, or timestamps themselves.

revoke all on public.movies, public.profiles, public.reviews from anon, authenticated;

grant select on public.movies, public.profiles, public.reviews to anon, authenticated;
grant insert (movie_id, rating, body) on public.reviews to authenticated;
grant update (rating, body) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;
grant update (display_name) on public.profiles to authenticated;

revoke execute on function public.sync_now_showing(jsonb) from public, anon, authenticated;
grant execute on function public.sync_now_showing(jsonb) to service_role;

revoke execute on function public.apply_review_stats() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.movies   enable row level security;
alter table public.profiles enable row level security;
alter table public.reviews  enable row level security;

create policy "movies are public" on public.movies
  for select to anon, authenticated using (true);

create policy "profiles are public" on public.profiles
  for select to anon, authenticated using (true);

create policy "users update their own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "reviews are public" on public.reviews
  for select to anon, authenticated using (true);

create policy "users write their own reviews" on public.reviews
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "users edit their own reviews" on public.reviews
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "users delete their own reviews" on public.reviews
  for delete to authenticated
  using (user_id = (select auth.uid()));
