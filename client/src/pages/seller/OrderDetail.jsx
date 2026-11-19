import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatAmd, formatDate } from '../../format.js';
import { ErrorState, Loading, Spinner, StatusBadge, Thumb, Timeline } from '../../components/ui.jsx';
import { Address } from '../OrderDetail.jsx';

const ACTIONS = {
  confirmed: { label: 'Confirm order', cls: 'btn' },
  shipped: { label: 'Mark shipped', cls: 'btn' },
  delivered: { label: 'Mark delivered', cls: 'btn' },
  cancelled: { label: 'Cancel order', cls: 'btn btn-danger' },
};

export default function SellerOrderDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api.get(`/seller/orders/${id}`).then((d) => setOrder(d.order)).catch(setError);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const move = async (to) => {
    if (to === 'cancelled' && !window.confirm('Cancel this order? The buyer will be notified and items returned to stock. This cannot be undone.')) return;
    setBusy(to);
    try {
      const d = await api.post(`/seller/orders/${id}/status`, { to });
      setOrder(d.order);
      toast.success(`Order ${ACTIONS[to] ? to : 'updated'}`);
    } catch (e) {
      toast.error(e.message);
      load();
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!order) return <Loading />;

  const allowed = order.allowed || [];
  const ordered = ['confirmed', 'shipped', 'delivered', 'cancelled'].filter((s) => allowed.includes(s));

  return (
    <div className="narrow-left">
      <Link to="/seller/orders" className="back-link">‹ Orders</Link>
      <div className="toolbar">
        <div>
          <h2 className="section-title">Order #{order.order_id} <span className="muted small">(part {order.id})</span></h2>
          <div className="muted small">Placed {formatDate(order.created_at, true)} by {order.buyer_name}</div>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="cash-box">
        <span>Cash to collect</span>
        <strong>{formatAmd(order.subtotal_amd)}</strong>
      </div>

      {ordered.length > 0 && (
        <div className="action-bar">
          {ordered.map((s) => (
            <button key={s} className={ACTIONS[s].cls + ' btn-lg'} onClick={() => move(s)} disabled={!!busy}>
              {busy === s ? <Spinner small /> : ACTIONS[s].label}
            </button>
          ))}
        </div>
      )}

      <div className="order-top">
        <section className="card pad">
          <h3 className="card-title">Deliver to</h3>
          <Address o={order} />
        </section>
        <section className="card pad">
          <h3 className="card-title">Status history</h3>
          <Timeline history={order.history} />
        </section>
      </div>

      <section className="card seller-part">
        <div className="group-head"><strong>Items</strong><span className="muted small">{order.items.length} lines</span></div>
        <div className="part-items">
          {order.items.map((it) => (
            <div key={it.id} className="order-item">
              <div className="oi-row">
                <Thumb image={it.image} className="ci-thumb" alt={it.title} />
                <div className="oi-body">
                  <Link to={`/product/${it.product_id}`} className="ci-title">{it.title}</Link>
                  <div className="muted small">{formatAmd(it.unit_price_amd)} × {it.quantity}</div>
                </div>
                <div className="ci-line">{formatAmd(it.unit_price_amd * it.quantity)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="part-foot">
          <div className="summary-row total"><span>Subtotal</span><span>{formatAmd(order.subtotal_amd)}</span></div>
        </div>
      </section>
    </div>
  );
}
