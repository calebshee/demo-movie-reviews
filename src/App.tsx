import { HashRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider.tsx';
import { isConfigured } from './lib/supabase.ts';
import { ConfigNotice } from './components/Notices.tsx';
import { DemoBanner, isDemo } from './components/DemoBanner.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { MoviePage } from './pages/MoviePage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';

// Hash routing: GitHub Pages serves static files only and has no SPA fallback, so
// deep links like /#/movie/123 must not depend on the server knowing the route.
export function App() {
  return (
    <HashRouter>
      <AuthProvider>
        {isDemo && <DemoBanner />}
        <Header />
        <main className="container">
          {isConfigured ? (
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/movie/:id" element={<MoviePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route
                path="*"
                element={
                  <div className="notice">
                    <h2>Page not found</h2>
                    <Link to="/">Back to now showing</Link>
                  </div>
                }
              />
            </Routes>
          ) : (
            <ConfigNotice />
          )}
        </main>
        <footer className="footer container">
          <p>
            Film data from{' '}
            <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">
              TMDB
            </a>
            . This product uses the TMDB API but is not endorsed or certified by TMDB. Listings approximate what is in
            Singapore cinemas and may lag by a day.
          </p>
        </footer>
      </AuthProvider>
    </HashRouter>
  );
}

function Header() {
  const { user, loading, signOut } = useAuth();
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link to="/" className="brand">
          🎬 SG Screen Reviews
        </Link>
        <nav>
          <NavLink to="/" end>
            Now showing
          </NavLink>
          {isConfigured &&
            !loading &&
            (user ? (
              <>
                <NavLink to="/profile">Profile</NavLink>
                <button type="button" className="link" onClick={() => void signOut()}>
                  Log out
                </button>
              </>
            ) : (
              <NavLink to="/login">Log in</NavLink>
            ))}
        </nav>
      </div>
    </header>
  );
}
