import { useState, type FormEvent } from 'react';
import { StarInput } from './Stars.tsx';
import { REVIEW_BODY_MAX, codePointLength, validateReview } from '../lib/validation.ts';

interface Props {
  initial?: { rating: number; body: string | null };
  submitLabel: string;
  onSubmit: (rating: number, body: string | null) => Promise<void>;
  onCancel?: () => void;
}

export function ReviewForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [body, setBody] = useState(initial?.body ?? '');
  const [errors, setErrors] = useState<{ rating?: string; body?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = validateReview({ rating, body });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await onSubmit(result.value.rating, result.value.body);
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Could not save your review.' });
    } finally {
      setBusy(false);
    }
  }

  const length = codePointLength(body.trim());
  return (
    <form className="review-form" onSubmit={handleSubmit} noValidate>
      <StarInput value={rating} onChange={setRating} invalid={Boolean(errors.rating)} />
      {errors.rating && <p className="field-error">{errors.rating}</p>}

      <label className="field">
        <span>Your review (optional)</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="What did you think?"
          aria-invalid={Boolean(errors.body)}
        />
      </label>
      <p className={length > REVIEW_BODY_MAX ? 'char-count over' : 'char-count'}>
        {length.toLocaleString()} / {REVIEW_BODY_MAX.toLocaleString()}
      </p>
      {errors.body && <p className="field-error">{errors.body}</p>}
      {errors.form && (
        <p className="form-error" role="alert">
          {errors.form}
        </p>
      )}

      <div className="actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
