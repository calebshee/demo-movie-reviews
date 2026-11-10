import { useId } from 'react';

/** Read-only star display for a 1–5 rating (fractional values round to the nearest half). */
export function Stars({ value, label }: { value: number; label?: string }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className="stars" role="img" aria-label={label ?? `${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= rounded ? 'star full' : i - 0.5 === rounded ? 'star half' : 'star'} aria-hidden>
          ★
        </span>
      ))}
    </span>
  );
}

/** Accessible 1–5 star picker built from native radio inputs. */
export function StarInput({
  value,
  onChange,
  invalid,
}: {
  value: number | null;
  onChange: (v: number) => void;
  invalid?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className={invalid ? 'star-input invalid' : 'star-input'}>
      <legend>Your rating</legend>
      <div className="star-input-row">
        {[1, 2, 3, 4, 5].map((i) => (
          <label key={i} className={value !== null && i <= value ? 'on' : ''}>
            <input
              type="radio"
              name={name}
              value={i}
              checked={value === i}
              onChange={() => onChange(i)}
            />
            <span aria-hidden>★</span>
            <span className="sr-only">
              {i} star{i > 1 ? 's' : ''}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
