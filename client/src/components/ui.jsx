import { Link } from 'react-router-dom';
import { formatDate, STATUS_LABELS } from '../format.js';

export function Spinner({ small }) {
  return <span className={small ? 'spinner spinner-sm' : 'spinner'} aria-label="Loading" />;
}

export function Loading({ text = 'Loading…' }) {
  return (
    <div className="state-box">
      <Spinner />
      <p className="muted">{text}</p>
    </div>
  );
}

export function Empty({ icon = '📦', title, children }) {
  return (
    <div className="state-box empty">
      <div className="empty-icon">{icon}</div>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const notFound = error && error.status === 404;
  return (
    <div className="state-box empty">
      <div className="empty-icon">{notFound ? '🔍' : '⚠️'}</div>
      <h3>{notFound ? 'Not found' : 'Something went wrong'}</h3>
      <p className="muted">{error ? error.message : ''}</p>
      {onRetry && !notFound && <button className="btn" onClick={onRetry}>Try again</button>}
      {notFound && <Link className="btn" to="/">Go to home page</Link>}
    </div>
  );
}

export function Stars({ value = 0, count, size }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  const full = Math.round(v);
  return (
    <span className={'stars' + (size === 'lg' ? ' stars-lg' : '')} title={`${v.toFixed(1)} out of 5`}>
      <span className="stars-on">{'★'.repeat(full)}</span>
      <span className="stars-off">{'★'.repeat(5 - full)}</span>
      {count !== undefined && <span className="stars-count">({count})</span>}
    </span>
  );
}

export function StatusBadge({ status }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

export function Timeline({ history }) {
  if (!history || !history.length) return null;
  return (
    <ol className="timeline">
      {history.map((h, i) => (
        <li key={i} className="tl-item">
          <span className={`tl-dot dot-${h.to_status}`} />
          <div>
            <div className="tl-title">
              <StatusBadge status={h.to_status} />
              {h.changed_by_name && <span className="muted small"> by {h.changed_by_name}</span>}
            </div>
            <div className="muted small">{formatDate(h.created_at, true)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Thumb({ image, alt = '', className = 'thumb' }) {
  const src = image && (image.thumb || image.large);
  return src ? (
    <img className={className} src={src} alt={alt} loading="lazy" />
  ) : (
    <div className={className + ' thumb-placeholder'} aria-hidden="true">🛍️</div>
  );
}

export function FieldError({ error }) {
  if (!error) return null;
  return <div className="field-error">{error}</div>;
}

export function StarPicker({ value, onChange }) {
  return (
    <div className="star-picker" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button"
          key={n}
          className={n <= value ? 'on' : ''}
          onClick={() => onChange(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          aria-checked={value === n}
          role="radio"
        >★</button>
      ))}
    </div>
  );
}

export function confirmAction(message) {
  return window.confirm(message);
}
