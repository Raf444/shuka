import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatAmd, formatDate } from '../format.js';
import { Empty, ErrorState, Loading, StatusBadge } from '../components/ui.jsx';

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api.get('/orders').then((d) => setOrders(d.orders || [])).catch(setError);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="container narrow">
      <h1 className="page-title">My orders</h1>
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !orders ? (
        <Loading />
      ) : orders.length === 0 ? (
        <Empty icon="📦" title="No orders yet">
          <p className="muted">When you place an order it will appear here.</p>
          <Link to="/search" className="btn">Start shopping</Link>
        </Empty>
      ) : (
        <div className="order-list">
          {orders.map((o) => (
            <Link key={o.id} to={`/orders/${o.id}`} className="card order-row">
              <div className="or-main">
                <div className="or-num">Order #{o.id}</div>
                <div className="muted small">{formatDate(o.created_at, true)} · {o.item_count} {o.item_count === 1 ? 'item' : 'items'}</div>
              </div>
              <div className="or-parts">
                {(o.seller_orders || []).map((so) => (
                  <div key={so.id} className="or-part">
                    <span className="small">{so.seller?.store_name}</span>
                    <StatusBadge status={so.status} />
                  </div>
                ))}
              </div>
              <div className="or-total">{formatAmd(o.total_amd)}<span className="chev">›</span></div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
