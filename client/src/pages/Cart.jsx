import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatAmd } from '../format.js';
import { Empty, ErrorState, Loading, Spinner, Thumb } from '../components/ui.jsx';
import { QtyStepper } from './Product.jsx';

export default function Cart() {
  const { setFromCart } = useCart();
  const toast = useToast();
  const nav = useNavigate();
  const [cart, setCart] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // product_id or 'accept'

  const apply = useCallback((c) => { setCart(c); setFromCart(c); }, [setFromCart]);

  const load = useCallback(() => {
    setError(null);
    api.get('/cart').then(apply).catch(setError);
  }, [apply]);

  useEffect(() => { load(); }, [load]);

  const setQty = async (item, quantity) => {
    setBusy(item.product_id);
    try {
      apply(await api.put(`/cart/items/${item.product_id}`, { quantity }));
    } catch (e) {
      toast.error(e.message);
      load();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (item) => {
    setBusy(item.product_id);
    try {
      apply(await api.del(`/cart/items/${item.product_id}`));
      toast.success('Removed from cart');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const acceptPrices = async () => {
    setBusy('accept');
    try {
      apply(await api.post('/cart/accept-prices'));
      toast.success('New prices accepted');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div className="container"><ErrorState error={error} onRetry={load} /></div>;
  if (!cart) return <div className="container"><Loading text="Loading your cart…" /></div>;

  const groups = cart.groups || [];
  if (groups.length === 0) {
    return (
      <div className="container">
        <h1 className="page-title">Your cart</h1>
        <Empty icon="🛒" title="Your cart is empty">
          <p className="muted">Find something you like and add it here.</p>
          <Link to="/search" className="btn">Start shopping</Link>
        </Empty>
      </div>
    );
  }

  const items = groups.flatMap((g) => g.items);
  const hasUnavailable = items.some((i) => i.unavailable || !i.is_published || i.stock <= 0);
  const hasPriceChange = items.some((i) => i.price_changed);
  const overStock = items.some((i) => !i.unavailable && i.stock > 0 && i.quantity > i.stock);
  const blocked = cart.has_issues || hasUnavailable || hasPriceChange || overStock;

  return (
    <div className="container">
      <h1 className="page-title">Your cart <span className="muted">({cart.count} {cart.count === 1 ? 'item' : 'items'})</span></h1>

      {blocked && (
        <div className="banner banner-warn">
          <div>
            <strong>Some items in your cart need attention.</strong>
            <div className="small">
              {hasPriceChange && 'Prices changed since you added some items. '}
              {hasUnavailable && 'Remove unavailable items to continue. '}
              {overStock && 'Some quantities exceed available stock. '}
            </div>
          </div>
          {hasPriceChange && (
            <button className="btn" onClick={acceptPrices} disabled={busy === 'accept'}>
              {busy === 'accept' ? <Spinner small /> : 'Accept new prices'}
            </button>
          )}
        </div>
      )}

      <div className="cart-layout">
        <div className="cart-groups">
          {groups.map((g) => (
            <section key={g.seller.id} className="card cart-group">
              <div className="group-head">
                <span>Sold by <strong>{g.seller.store_name}</strong></span>
                <span className="muted small">Subtotal: <strong>{formatAmd(g.subtotal_amd)}</strong></span>
              </div>
              {g.items.map((it) => {
                const unavailable = it.unavailable || !it.is_published;
                const outOfStock = !unavailable && it.stock <= 0;
                return (
                  <div key={it.product_id} className={'cart-item' + (unavailable || outOfStock ? ' is-dim' : '')}>
                    <Link to={`/product/${it.product_id}`}><Thumb image={it.image} alt={it.title} className="ci-thumb" /></Link>
                    <div className="ci-body">
                      <Link to={`/product/${it.product_id}`} className="ci-title">{it.title}</Link>
                      <div className="ci-price">{formatAmd(it.price_amd)}</div>
                      {it.price_changed && (
                        <div className="item-warn">Price changed from {formatAmd(it.price_when_added)} to {formatAmd(it.price_amd)}</div>
                      )}
                      {unavailable && <div className="item-warn danger">This item is no longer available. Please remove it.</div>}
                      {outOfStock && <div className="item-warn danger">Out of stock. Please remove it.</div>}
                      {!unavailable && it.stock > 0 && it.quantity > it.stock && (
                        <div className="item-warn">Only {it.stock} left — please lower the quantity.</div>
                      )}
                      <div className="ci-actions">
                        {!unavailable && it.stock > 0 && (
                          <QtyStepper
                            value={it.quantity}
                            max={Math.max(it.stock, 1)}
                            disabled={busy === it.product_id}
                            onChange={(q) => q !== it.quantity && setQty(it, q)}
                          />
                        )}
                        <button className="link-btn danger" onClick={() => remove(it)} disabled={busy === it.product_id}>Remove</button>
                        {busy === it.product_id && <Spinner small />}
                      </div>
                    </div>
                    <div className="ci-line">{formatAmd(it.price_amd * it.quantity)}</div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        <aside className="card summary">
          <div className="summary-row"><span>Items ({cart.count})</span><span>{formatAmd(cart.total_amd)}</span></div>
          <div className="summary-row"><span>Delivery</span><span className="muted">Set by seller</span></div>
          <div className="summary-row total"><span>Total</span><span>{formatAmd(cart.total_amd)}</span></div>
          <div className="muted small">💵 Payment: cash on delivery</div>
          <button className="btn btn-block btn-lg" disabled={blocked} onClick={() => nav('/checkout')}>
            Proceed to checkout
          </button>
          {blocked && <div className="muted small center">Resolve the issues above to continue.</div>}
        </aside>
      </div>
    </div>
  );
}
