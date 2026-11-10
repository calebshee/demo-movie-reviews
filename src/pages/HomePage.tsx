import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listNowShowing, searchMovies } from '../lib/api.ts';
import { useAsync } from '../lib/useAsync.ts';
import type { HomeSort } from '../lib/types.ts';
import { MovieCard } from '../components/MovieCard.tsx';
import { ErrorNotice, Loading } from '../components/Notices.tsx';

export function HomePage() {
  const [params, setParams] = useSearchParams();
  const sort: HomeSort = params.get('sort') === 'rating' ? 'rating' : 'newest';
  const query = params.get('q')?.trim() ?? '';
  const [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);

  const movies = useAsync(() => (query ? searchMovies(query) : listNowShowing(sort)), [query, sort]);

  function update(next: Record<string, string | null>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p);
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    update({ q: draft.trim() || null });
  }

  return (
    <>
      <section className="hero">
        <h1>{query ? `Results for “${query}”` : 'Now showing in Singapore'}</h1>
        <p className="lede">
          {query
            ? 'Searching every film we have tracked, including ones that have left cinemas.'
            : 'English-language films currently in Singapore cinemas. Updated daily.'}
        </p>
      </section>

      <div className="toolbar">
        <form className="search" role="search" onSubmit={onSearch}>
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search films…"
            aria-label="Search films"
          />
          <button type="submit" className="btn">
            Search
          </button>
          {query && (
            <button type="button" className="btn ghost" onClick={() => update({ q: null })}>
              Clear
            </button>
          )}
        </form>
        {!query && (
          <label className="sort">
            <span>Sort by</span>
            <select value={sort} onChange={(e) => update({ sort: e.target.value === 'rating' ? 'rating' : null })}>
              <option value="newest">Newest release</option>
              <option value="rating">Community rating</option>
            </select>
          </label>
        )}
      </div>

      {movies.status === 'loading' && <Loading />}
      {movies.status === 'error' && <ErrorNotice error={movies.error} onRetry={movies.reload} />}
      {movies.status === 'success' &&
        (movies.data.length === 0 ? (
          <p className="empty">
            {query ? 'No films match that search.' : 'No films yet. The daily sync has not run.'}
          </p>
        ) : (
          <div className="grid">
            {movies.data.map((m) => (
              <MovieCard key={m.id} movie={m} />
            ))}
          </div>
        ))}
    </>
  );
}
