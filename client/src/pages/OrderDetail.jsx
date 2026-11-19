import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import { formatAmd, formatDate } from '../format.js';
import { ErrorState, Loading, Spinner, StarPicker, StatusBadge, Thumb, Timeline } from '../components/ui.jsx';

export default function OrderDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const placed = params.get('placed') === '1';
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api.get(`/orders/${id}`).then((d) => setOrder(d.order)).catch(setError);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const cancel = async (so) => {
    if (!window.confirm(`Cancel the part of this order from ${so.seller.store_name}? This cannot be undone.`)) return;
    setCancelling(so.id);
    try {
      const d = await api.post(`/orders/${id}/sellers/${so.id}/cancel`);
      setOrder(d.order);
      toast.success('Order cancelled');
    } catch (e) {
      toast.error(e.message);
      load();
    } finally {
      setCancelling(null);
    }
  };

  const markReviewed = (soId, itemId) => {
    setOrder((o) => ({
      ...o,
      seller_orders: o.seller_orders.map((so) =>
        so.id !== soId ? so : { ...so, items: so.items.map((it) => (it.id === itemId ? { ...it, can_review: false, reviewed: true } : it)) }
      ),
    }));
  };

  if (error) return <div className="container"><ErrorState error={error} onRetry={load} /></div>;
  if (!order) return <div className="container"><Loading /></div>;

  return (
    <div className="container narrow">
      {placed && (
        <div className="banner banner-success">
          <div>
            <strong>🎉 Order #{order.id} placed!</strong>
            <div className="small">Thank you. Sellers will confirm your order soon. You'll pay {formatAmd(order.total_amd)} in cash on delivery.</div>
          </div>
        </div>
      )}
      <Link to="/orders" className="back-link">‹ My orders</Link>
      <div className="order-head">
        <h1 className="page-title">Order #{order.id}</h1>
        <div className="muted">Placed {formatDate(order.created_at, true)}</div>
      </div>

      <div className="order-top">
        <section className="card pad">
          <h2 className="card-title">Delivery address</h2>
          <Address o={order} />
        </section>
        <section className="card pad">
          <h2 className="card-title">Payment</h2>
          <div className="big-money">{formatAmd(order.total_amd)}</div>
          <div className="muted small">💵 Cash on delivery</div>
        </section>
      </div>

      {(order.seller_orders || []).map((so) => (
        <section key={so.id} className="card seller-part">
          <div className="group-head">
            <span>Sold by <strong>{so.seller?.store_name}</strong></span>
            <StatusBadge status={so.status} />
          </div>
          <div className="part-items">
            {so.items.map((it) => (
              <OrderItem key={it.id} item={it} onReviewed={() => markReviewed(so.id, it.id)} />
            ))}
          </div>
          <div className="part-foot">
            <div className="summary-row"><span>Subtotal</span><strong>{formatAmd(so.subtotal_amd)}</strong></div>
            <details className="history">
              <summary>Status history</summary>
              <Timeline history={so.history} />
            </details>
            {so.can_cancel && (
              <button className="btn btn-danger-outline" onClick={() => cancel(so)} disabled={cancelling === so.id}>
                {cancelling === so.id ? <Spinner small /> : 'Cancel this order'}
              </button>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export function Address({ o }) {
  return (
    <div className="address">
      <div><strong>{o.recipient}</strong></div>
      <div>{o.street}{o.apartment ? `, apt. ${o.apartment}` : ''}</div>
      <div>{o.city}, {o.region}</div>
      <div><a href={`tel:${(o.phone || '').replace(/\s/g, '')}`}>{o.phone}</a></div>
      {o.note && <div className="note pre-line">📝 {o.note}</div>}
    </div>
  );
}

function OrderItem({ item, onReviewed }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) { setErr('Please choose a rating'); return; }
    setSaving(true);
    setErr(null);
    try {
      await api.post(`/products/${item.product_id}/reviews`, { rating, body: body.trim() });
      toast.success('Thanks for your review!');
      setOpen(false);
      onReviewed();
    } catch (e2) {
      if (e2.status === 409) { onReviewed(); setOpen(false); }
      setErr(e2.details?.body || e2.details?.rating || e2.message);
      toast.error(e2.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="order-item">
      <div className="oi-row">
        <Link to={`/product/${item.product_id}`}><Thumb image={item.image} className="ci-thumb" alt={item.title} /></Link>
        <div className="oi-body">
          <Link to={`/product/${item.product_id}`} className="ci-title">{item.title}</Link>
          <div className="muted small">{formatAmd(item.unit_price_amd)} × {item.quantity}</div>
          {item.reviewed && <span className="badge badge-muted">✓ Reviewed</span>}
          {item.can_review && !item.reviewed && !open && (
            <button className="link-btn" onClick={() => setOpen(true)}>★ Write a review</button>
          )}
        </div>
        <div className="ci-line">{formatAmd(item.unit_price_amd * item.quantity)}</div>
      </div>
      {open && (
        <form className="review-form" onSubmit={submit}>
          <StarPicker value={rating} onChange={(v) => { setRating(v); setErr(null); }} />
          <textarea rows="3" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What did you like or dislike?" />
          {err && <div className="field-error">{err}</div>}
          <div className="row-gap">
            <button className="btn btn-sm" type="submit" disabled={saving}>{saving ? <Spinner small /> : 'Submit review'}</button>
            <button className="btn btn-sm btn-outline" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
