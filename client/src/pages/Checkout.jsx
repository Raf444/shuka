import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatAmd } from '../format.js';
import { Empty, ErrorState, FieldError, Loading, Spinner, Thumb } from '../components/ui.jsx';

function uuid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  // Fallback for non-secure contexts (e.g. testing on a phone over LAN http)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function Checkout() {
  const { user } = useAuth();
  const { refresh } = useCart();
  const toast = useToast();
  const nav = useNavigate();
  const requestKey = useRef(null);
  if (!requestKey.current) requestKey.current = uuid();

  const [cart, setCart] = useState(null);
  const [regions, setRegions] = useState([]);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [conflict, setConflict] = useState(null);

  const la = user?.last_address;
  const [form, setForm] = useState({
    recipient: la?.recipient || user?.name || '',
    phone: la?.phone || user?.phone || '',
    region: la?.region || '',
    city: la?.city || '',
    street: la?.street || '',
    apartment: la?.apartment || '',
    note: la?.note || '',
  });

  useEffect(() => {
    api.get('/cart').then(setCart).catch(setError);
    api.get('/regions').then((d) => setRegions(d.regions || [])).catch(() => {});
  }, []);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setFieldErrors((fe) => ({ ...fe, [k]: undefined }));
  };

  const validate = () => {
    const fe = {};
    if (!form.recipient.trim()) fe.recipient = 'Recipient name is required';
    if (!form.phone.trim()) fe.phone = 'Phone is required';
    else if (!/^[+\d][\d\s()-]{5,}$/.test(form.phone.trim())) fe.phone = 'Enter a valid phone number';
    if (!form.region) fe.region = 'Choose a region';
    if (!form.city.trim()) fe.city = 'City or village is required';
    if (!form.street.trim()) fe.street = 'Street and building are required';
    return fe;
  };

  const placeOrder = async (e) => {
    e.preventDefault();
    if (submitting || submitted) return;
    const fe = validate();
    setFieldErrors(fe);
    if (Object.keys(fe).length) {
      toast.error('Please fill in the delivery details');
      return;
    }
    setSubmitting(true);
    setConflict(null);
    try {
      const body = { request_key: requestKey.current, ...form };
      Object.keys(body).forEach((k) => { if (typeof body[k] === 'string') body[k] = body[k].trim(); });
      const res = await api.post('/orders', body);
      setSubmitted(true);
      refresh();
      nav(`/orders/${res.order.id}?placed=1`, { replace: true });
    } catch (err) {
      setSubmitting(false);
      if (err.status === 400 && err.details) {
        setFieldErrors(err.details);
        toast.error(err.message);
      } else if (err.status === 409) {
        setConflict(err);
        toast.error(err.message);
        window.scrollTo(0, 0);
      } else {
        toast.error(err.message);
      }
    }
  };

  if (error) return <div className="container"><ErrorState error={error} /></div>;
  if (!cart) return <div className="container"><Loading /></div>;
  if (!cart.groups || cart.groups.length === 0) {
    return (
      <div className="container">
        <Empty icon="🛒" title="Your cart is empty">
          <Link to="/search" className="btn">Continue shopping</Link>
        </Empty>
      </div>
    );
  }

  return (
    <div className="container checkout">
      <h1 className="page-title">Checkout</h1>

      {conflict && (
        <div className="banner banner-error">
          <div>
            <strong>We couldn't place your order.</strong>
            <div>{conflict.message}</div>
          </div>
          <Link to="/cart" className="btn btn-outline">Back to cart</Link>
        </div>
      )}
      {cart.has_issues && !conflict && (
        <div className="banner banner-warn">
          <div>Some items in your cart changed. Please review your cart first.</div>
          <Link to="/cart" className="btn btn-outline">Review cart</Link>
        </div>
      )}

      <form className="checkout-layout" onSubmit={placeOrder} noValidate>
        <section className="card form-card">
          <h2 className="section-title">Delivery address</h2>
          <div className="form-grid">
            <Field label="Recipient name" error={fieldErrors.recipient}>
              <input value={form.recipient} onChange={set('recipient')} autoComplete="name" />
            </Field>
            <Field label="Phone" error={fieldErrors.phone}>
              <input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="+374 XX XXX XXX" />
            </Field>
            <Field label="Region" error={fieldErrors.region}>
              <select value={form.region} onChange={set('region')}>
                <option value="">Choose region…</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="City or village" error={fieldErrors.city}>
              <input value={form.city} onChange={set('city')} autoComplete="address-level2" />
            </Field>
            <Field label="Street & building" error={fieldErrors.street} wide>
              <input value={form.street} onChange={set('street')} autoComplete="address-line1" placeholder="e.g. Abovyan 12" />
            </Field>
            <Field label="Apartment" error={fieldErrors.apartment}>
              <input value={form.apartment} onChange={set('apartment')} autoComplete="address-line2" placeholder="Optional" />
            </Field>
            <Field label="Note for the courier (optional)" error={fieldErrors.note} wide>
              <textarea rows="3" value={form.note} onChange={set('note')} placeholder="Entrance, floor, best time to call…" />
            </Field>
          </div>
        </section>

        <aside className="card summary">
          <h2 className="section-title">Order summary</h2>
          {cart.groups.map((g) => (
            <div key={g.seller.id} className="summary-group">
              <div className="muted small">Sold by <strong>{g.seller.store_name}</strong></div>
              {g.items.map((it) => (
                <div key={it.product_id} className="summary-item">
                  <Thumb image={it.image} className="si-thumb" />
                  <span className="si-title">{it.title} <span className="muted">× {it.quantity}</span></span>
                  <span>{formatAmd(it.price_amd * it.quantity)}</span>
                </div>
              ))}
              <div className="summary-row small"><span>Subtotal</span><span>{formatAmd(g.subtotal_amd)}</span></div>
            </div>
          ))}
          <div className="summary-row total"><span>Total</span><span>{formatAmd(cart.total_amd)}</span></div>
          <div className="pay-note">💵 Payment: <strong>cash on delivery</strong></div>
          <button className="btn btn-block btn-lg" type="submit" disabled={submitting || submitted}>
            {submitting ? <><Spinner small /> Placing order…</> : 'Place order'}
          </button>
        </aside>
      </form>
    </div>
  );
}

export function Field({ label, error, children, wide }) {
  return (
    <label className={'field' + (wide ? ' wide' : '') + (error ? ' has-error' : '')}>
      <span className="label">{label}</span>
      {children}
      <FieldError error={error} />
    </label>
  );
}
