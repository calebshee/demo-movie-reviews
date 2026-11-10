import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.tsx';
import {
  REVIEWS_PAGE_SIZE,
  createReview,
  deleteReview,
  getMovie,
  getMyReview,
  listReviews,
  updateReview,
} from '../lib/api.ts';
import { backdropUrl, formatRating, formatReleaseDate, formatTimestamp, posterUrl } from '../lib/format.ts';
import type { Movie, Review } from '../lib/types.ts';
import { useAsync } from '../lib/useAsync.ts';
import { ErrorNotice, Loading } from '../components/Notices.tsx';
import { ReviewForm } from '../components/ReviewForm.tsx';
import { Stars } from '../components/Stars.tsx';

export function MoviePage() {
  const { id } = useParams();
  const movieId = Number(id);
  const valid = Number.isSafeInteger(movieId) && movieId > 0;
  // Bumped after every review write so the aggregates, my review and the list all refresh.
  const [version, setVersion] = useState(0);

  const movie = useAsync(() => (valid ? getMovie(movieId) : Promise.resolve(null)), [movieId, version]);

  if (movie.status === 'error') return <ErrorNotice error={movie.error} onRetry={movie.reload} />;
  if (movie.status === 'success' && !movie.data) {
    return (
      <div className="notice">
        <h2>Film not found</h2>
        <p>
          <Link to="/">Back to now showing</Link>
        </p>
      </div>
    );
  }
  // While refreshing after a review write, keep showing the current film (stale data)
  // rather than flashing a spinner; never show a different film's stale data.
  if (!movie.data || movie.data.id !== movieId) return <Loading />;
  return (
    <MovieDetail
      key={movie.data.id}
      movie={movie.data}
      version={version}
      onChanged={() => setVersion((v) => v + 1)}
    />
  );
}

function MovieDetail({ movie, version, onChanged }: { movie: Movie; version: number; onChanged: () => void }) {
  const poster = posterUrl(movie.poster_path, 'w500');
  const backdrop = backdropUrl(movie.backdrop_path);
  return (
    <article className="movie-detail">
      <header className="movie-header" style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined}>
        <div className="movie-header-inner">
          {poster ? (
            <img className="detail-poster" src={poster} alt={`${movie.title} poster`} />
          ) : (
            <div className="detail-poster poster-fallback" aria-hidden>
              No poster
            </div>
          )}
          <div>
            <h1>{movie.title}</h1>
            <p className="meta">
              {movie.now_showing ? (
                <span className="badge">Now showing</span>
              ) : (
                <span className="badge muted">No longer in cinemas</span>
              )}{' '}
              SG release {formatReleaseDate(movie.sg_release_date)}
            </p>
            {movie.genres.length > 0 && <p className="meta">{movie.genres.join(' · ')}</p>}

            <div className="ratings">
              {movie.community_rating === null ? (
                <p className="meta">No community ratings yet.</p>
              ) : (
                <div className="rating-main">
                  <span className="rating-number">{formatRating(movie.community_rating)}</span>
                  <div>
                    <Stars value={movie.community_rating} />
                    <p className="meta">
                      Community rating · {movie.review_count} review{movie.review_count === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              )}
              {movie.tmdb_vote_average !== null && (
                <p className="rating-secondary">
                  TMDB {movie.tmdb_vote_average.toFixed(1)}/10
                  {movie.tmdb_vote_count ? ` (${movie.tmdb_vote_count.toLocaleString()} votes)` : ''}
                </p>
              )}
            </div>

            {movie.overview && <p className="overview">{movie.overview}</p>}
          </div>
        </div>
      </header>

      <MyReview movieId={movie.id} version={version} onChanged={onChanged} />
      <ReviewList movieId={movie.id} version={version} />
    </article>
  );
}

function MyReview({ movieId, version, onChanged }: { movieId: number; version: number; onChanged: () => void }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [editing, setEditing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const mine = useAsync(
    () => (user ? getMyReview(movieId, user.id) : Promise.resolve(null)),
    [movieId, user?.id, version],
  );

  if (loading) return null;
  if (!user) {
    return (
      <section className="panel">
        <p>
          <Link to="/login" state={{ from: location.pathname }} className="btn primary">
            Log in to write a review
          </Link>
        </p>
      </section>
    );
  }
  if (mine.status === 'loading') return <Loading label="Loading your review…" />;
  if (mine.status === 'error') return <ErrorNotice error={mine.error} onRetry={mine.reload} />;

  const review = mine.data;
  if (!review) {
    return (
      <section className="panel">
        <h2>Write a review</h2>
        <ReviewForm
          submitLabel="Post review"
          onSubmit={async (rating, body) => {
            await createReview(movieId, rating, body);
            onChanged();
          }}
        />
      </section>
    );
  }

  if (editing) {
    return (
      <section className="panel">
        <h2>Edit your review</h2>
        <ReviewForm
          initial={review}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (rating, body) => {
            await updateReview(review.id, rating, body);
            setEditing(false);
            onChanged();
          }}
        />
      </section>
    );
  }

  async function onDelete() {
    if (!review || !window.confirm('Delete your review? This cannot be undone.')) return;
    setDeleteError(null);
    try {
      await deleteReview(review.id);
      onChanged();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete your review.');
    }
  }

  return (
    <section className="panel">
      <h2>Your review</h2>
      <ReviewItem review={review} />
      <div className="actions">
        <button type="button" className="btn" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button type="button" className="btn danger" onClick={onDelete}>
          Delete
        </button>
      </div>
      {deleteError && (
        <p className="form-error" role="alert">
          {deleteError}
        </p>
      )}
    </section>
  );
}

function ReviewList({ movieId, version }: { movieId: number; version: number }) {
  const [page, setPage] = useState(0);
  const result = useAsync(() => listReviews(movieId, page), [movieId, page, version]);

  return (
    <section className="reviews">
      <h2>Reviews</h2>
      {result.status === 'loading' && <Loading label="Loading reviews…" />}
      {result.status === 'error' && <ErrorNotice error={result.error} onRetry={result.reload} />}
      {result.status === 'success' && (
        <ReviewPage
          reviews={result.data.reviews}
          total={result.data.total}
          page={page}
          onPage={(p) => {
            setPage(p);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}
    </section>
  );
}

function ReviewPage({
  reviews,
  total,
  page,
  onPage,
}: {
  reviews: Review[];
  total: number;
  page: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / REVIEWS_PAGE_SIZE));
  if (total === 0) return <p className="empty">No reviews yet. Be the first.</p>;
  return (
    <>
      <ul className="review-list">
        {reviews.map((r) => (
          <li key={r.id}>
            <ReviewItem review={r} />
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <nav className="pager" aria-label="Review pages">
          <button type="button" className="btn ghost" disabled={page === 0} onClick={() => onPage(page - 1)}>
            ← Newer
          </button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <button type="button" className="btn ghost" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
            Older →
          </button>
        </nav>
      )}
    </>
  );
}

function ReviewItem({ review }: { review: Review }) {
  const edited = new Date(review.updated_at).getTime() - new Date(review.created_at).getTime() > 1000;
  return (
    <div className="review">
      <div className="review-head">
        <strong>{review.author?.display_name ?? 'Former member'}</strong>
        <Stars value={review.rating} />
        <time dateTime={review.created_at} className="meta">
          {formatTimestamp(review.created_at)}
          {edited && ' · edited'}
        </time>
      </div>
      {review.body && <p className="review-body">{review.body}</p>}
    </div>
  );
}
