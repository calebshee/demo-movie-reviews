import { describe, expect, it } from 'vitest';
import { escapeLike, validateDisplayName, validateReview } from './validation.ts';

describe('validateReview', () => {
  it('accepts a rating with no text and normalises empty text to null', () => {
    expect(validateReview({ rating: 4, body: '   ' })).toEqual({ ok: true, value: { rating: 4, body: null } });
  });

  it('trims the body', () => {
    expect(validateReview({ rating: 5, body: '  Great  ' })).toEqual({ ok: true, value: { rating: 5, body: 'Great' } });
  });

  it.each([null, 0, 6, 2.5])('rejects rating %s', (rating) => {
    const r = validateReview({ rating, body: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.rating).toBeDefined();
  });

  it('counts characters the way Postgres does (emoji = 1)', () => {
    expect(validateReview({ rating: 3, body: '🎬'.repeat(2000) }).ok).toBe(true);
    expect(validateReview({ rating: 3, body: 'a'.repeat(2001) }).ok).toBe(false);
  });
});

describe('validateDisplayName', () => {
  it('trims and accepts normal names', () => {
    expect(validateDisplayName('  Mei Ling ')).toEqual({ ok: true, value: 'Mei Ling' });
  });
  it('rejects empty and over-long names', () => {
    expect(validateDisplayName('   ').ok).toBe(false);
    expect(validateDisplayName('x'.repeat(51)).ok).toBe(false);
  });
});

describe('escapeLike', () => {
  it('escapes LIKE wildcards and backslashes', () => {
    expect(escapeLike('100%_off\\')).toBe('100\\%\\_off\\\\');
  });
});
