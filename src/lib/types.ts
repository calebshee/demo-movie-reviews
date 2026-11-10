export interface Movie {
  id: number;
  title: string;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  sg_release_date: string | null;
  genres: string[];
  tmdb_vote_average: number | null;
  tmdb_vote_count: number | null;
  now_showing: boolean;
  review_count: number;
  community_rating: number | null;
}

export interface Review {
  id: number;
  movie_id: number;
  user_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  updated_at: string;
  author: { display_name: string } | null;
}

export interface Profile {
  id: string;
  display_name: string;
}

export type HomeSort = 'newest' | 'rating';
