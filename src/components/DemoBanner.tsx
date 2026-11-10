import { DEMO_STORAGE_KEY } from '../demo/storageKey.ts';

/** True in `vite --mode demo` builds; replaced with a constant at build time. */
export const isDemo = import.meta.env.MODE === 'demo';

function resetDemo() {
  if (!window.confirm('Reset the demo to its sample data? Your reviews and account will be removed.')) return;
  try {
    localStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    // storage blocked: the reload alone starts fresh
  }
  window.location.hash = '#/';
  window.location.reload();
}

export function DemoBanner() {
  return (
    <div className="demo-banner" role="note">
      <div className="container demo-banner-inner">
        <p>
          <strong>Demo mode.</strong> Sample films and reviews, stored only in this browser. Sign up with any email and
          password to post a review.
        </p>
        <button type="button" className="btn ghost small" onClick={resetDemo}>
          Reset demo
        </button>
      </div>
    </div>
  );
}
