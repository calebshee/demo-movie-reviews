import { Link } from 'react-router-dom';
import type { Movie } from '../lib/types.ts';
import { formatRating, formatReleaseDate, posterUrl } from '../lib/format.ts';

export function MovieCard({ movie }: { movie: Movie }) {
  const poster = posterUrl(movie.poster_path);
  return (
    <Link to={`/movie/${movie.id}`} className="movie-card">
      <div className="poster">
        {poster ? <img src={poster} alt="" loading="lazy" /> : <div className="poster-fallback">{movie.title}</div>}
        {!movie.now_showing && <span className="badge muted">Not showing</span>}
      </div>
      <div className="movie-card-body">
        <h3>{movie.title}</h3>
        <p className="meta">{formatReleaseDate(movie.sg_release_date)}</p>
        <p className="meta">
          <span className="accent">★ {formatRating(movie.community_rating)}</span>{' '}
          <span>
            ({movie.review_count} review{movie.review_count === 1 ? '' : 's'})
          </span>
        </p>
      </div>
    </Link>
  );
}
