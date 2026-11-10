// Client-side checks mirror the database constraints so users get instant feedback;
// the database remains the authority.

export const REVIEW_BODY_MAX = 2000;
export const DISPLAY_NAME_MAX = 50;

/** Postgres char_length counts code points; String#length counts UTF-16 units. */
export const codePointLength = (s: string) => [...s].length;

export interface ReviewInput {
  rating: number | null;
  body: string;
}

export type ReviewValidation =
  | { ok: true; value: { rating: number; body: string | null } }
  | { ok: false; errors: { rating?: string; body?: string } };

export function validateReview(input: ReviewInput): ReviewValidation {
  const errors: { rating?: string; body?: string } = {};
  const { rating } = input;
  if (rating === null || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.rating = 'Pick a rating from 1 to 5 stars.';
  }
  const body = input.body.trim();
  if (codePointLength(body) > REVIEW_BODY_MAX) {
    errors.body = `Keep your review under ${REVIEW_BODY_MAX} characters.`;
  }
  if (errors.rating || errors.body) return { ok: false, errors };
  return { ok: true, value: { rating: rating!, body: body === '' ? null : body } };
}

export function validateDisplayName(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (value === '') return { ok: false, error: 'Display name cannot be empty.' };
  if (codePointLength(value) > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Display name must be ${DISPLAY_NAME_MAX} characters or fewer.` };
  }
  return { ok: true, value };
}

/** Escapes LIKE wildcards so a search for "100%" matches literally. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}
