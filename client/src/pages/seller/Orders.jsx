import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { formatAmd, formatDate } from '../../format.js';
import { Empty, ErrorState, Loading, StatusBadge } from '../../components/ui.jsx';

const TABS = [
  ['', 'All', 'all'],
  ['placed', 'Placed'],
  ['confirmed', 'Confirmed'],
  ['shipped', 'Shipped'],
  ['delivered', 'Delivered'],
  ['cancelled', 'Cancelled'],
];

export default function SellerOrders() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    api.get('/seller/orders' + qs({ status })).then(setData).catch(setError);
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const counts = data?.counts || {};

  return (
    <div>
      <div className="pill-tabs" role="tablist">
        {TABS.map(([s, label, key]) => (
          <button
            key={label}
            role="tab"
            aria-selected={status === s}
            className={status === s ? 'active' : ''}
            onClick={() => setParams(s ? { status: s } : {})}
          >
            {label}
            {data && <span className="pill-count">{counts[key || s] ?? 0}</span>}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !data ? (
        <Loading />
      ) : data.orders.length === 0 ? (
        <Empty icon="📭" title={status ? 'No orders with this status' : 'No orders yet'}>
          <p className="muted">Orders from buyers will show up here.</p>
        </Empty>
      ) : (
        <div className="order-list">
          {data.orders.map((o) => (
            <Link key={o.id} to={`/seller/orders/${o.id}`} className="card order-row">
              <div className="or-main">
                <div className="or-num">Order #{o.order_id}<span className="muted small"> · part {o.id}</span></div>
                <div className="muted small">{formatDate(o.created_at, true)} · {o.item_count} {o.item_count === 1 ? 'item' : 'items'}</div>
                <div className="small">{o.recipient} — {o.city}, {o.region}</div>
              </div>
              <div className="or-parts"><StatusBadge status={o.status} /></div>
              <div className="or-total">{formatAmd(o.subtotal_amd)}<span className="chev">›</span></div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
