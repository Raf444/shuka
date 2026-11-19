import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { formatAmd, STATUS_LABELS } from '../../format.js';
import { ErrorState, Loading, StatusBadge } from '../../components/ui.jsx';

export default function Overview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api.get('/seller/overview').then(setData).catch(setError);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Loading />;

  const counts = data.counts || {};
  return (
    <div>
      <div className="stat-grid">
        <Link to="/seller/orders?status=placed" className="stat-card stat-accent">
          <span className="stat-label">To confirm</span>
          <span className="stat-value">{data.to_confirm}</span>
          <span className="stat-hint">New orders waiting</span>
        </Link>
        <Link to="/seller/orders?status=confirmed" className="stat-card">
          <span className="stat-label">To ship</span>
          <span className="stat-value">{data.to_ship}</span>
          <span className="stat-hint">Confirmed, not shipped</span>
        </Link>
        <div className="stat-card">
          <span className="stat-label">Revenue, last 30 days</span>
          <span className="stat-value money">{formatAmd(data.revenue_30d)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total revenue</span>
          <span className="stat-value money">{formatAmd(data.revenue_total)}</span>
        </div>
      </div>

      <div className="overview-row">
        <section className="card pad">
          <h2 className="card-title">Orders by status</h2>
          <div className="status-counts">
            {Object.keys(STATUS_LABELS).map((s) => (
              <Link key={s} to={`/seller/orders?status=${s}`} className="status-count">
                <StatusBadge status={s} />
                <strong>{counts[s] || 0}</strong>
              </Link>
            ))}
          </div>
        </section>
        <section className="card pad">
          <h2 className="card-title">Products</h2>
          <div className="stat-value">{data.products_count ?? 0}</div>
          <div className="row-gap">
            <Link to="/seller/products" className="btn btn-outline btn-sm">Manage products</Link>
            <Link to="/seller/products/new" className="btn btn-sm">+ Add product</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
