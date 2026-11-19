import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatAmd, formatDate, stockLabel } from '../format.js';
import { ErrorState, Loading, Spinner, Stars } from '../components/ui.jsx';

export default function Product() {
  const { id } = useParams();
  const { user } = useAuth();
  const { setFromCart } = useCart();
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();

  const [product, setProduct] = useState(null);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [reviews, setReviews] = useState(null);

  const load = useCallback(() => {
    setError(null);
    setProduct(null);
    setActive(0);
    setQty(1);
    api.get(`/products/${id}`).then((d) => setProduct(d.product)).catch(setError);
    setReviews(null);
    api.get(`/products/${id}/reviews`).then((d) => setReviews(d.reviews || [])).catch(() => setReviews([]));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="container"><ErrorState error={error} onRetry={load} /></div>;
  if (!product) return <div className="container"><Loading /></div>;

  const images = [...(product.images || [])].sort((a, b) => a.position - b.position);
  const main = images[active] || images[0];
  const stock = stockLabel(product.stock);
  const maxQty = Math.max(1, product.stock);

  const addToCart = async () => {
    if (!user) {
      toast.info('Please log in to add items to your cart');
      nav('/login', { state: { from: loc.pathname } });
      return;
    }
    setAdding(true);
    try {
      const cart = await api.put(`/cart/items/${product.id}`, { quantity: qty, add: true });
      setFromCart(cart);
      toast.success(`Added ${qty} × ${product.title} to your cart`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="container product-page">
      <nav className="breadcrumbs small">
        <Link to="/">Home</Link> ›{' '}
        {product.category && (
          <><Link to={`/search?category=${encodeURIComponent(product.category.slug)}`}>{product.category.name}</Link> › </>
        )}
        <span className="muted">{product.title}</span>
      </nav>

      <div className="product-layout">
        <div className="gallery">
          <div className="gallery-main card">
            {main ? <img src={main.large || main.thumb} alt={product.title} /> : <div className="thumb-placeholder big">🛍️</div>}
          </div>
          {images.length > 1 && (
            <div className="gallery-thumbs">
              {images.map((img, i) => (
                <button key={img.id} className={i === active ? 'active' : ''} onClick={() => setActive(i)} aria-label={`Image ${i + 1}`}>
                  <img src={img.thumb} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product-info">
          <h1 className="product-title">{product.title}</h1>
          <div className="product-meta">
            <Stars value={product.rating_avg} count={product.rating_count} size="lg" />
            {product.rating_count > 0 && <span className="muted small">{Number(product.rating_avg).toFixed(1)} out of 5</span>}
          </div>
          <div className="product-price">{formatAmd(product.price_amd)}</div>
          <div className={'stock ' + stock.cls}>{stock.text}</div>
          {product.seller && (
            <div className="seller-line">Sold by <strong>{product.seller.store_name}</strong></div>
          )}

          <div className="buy-box card">
            <div className="buy-price">{formatAmd(product.price_amd)}</div>
            <div className="muted small">Pay cash on delivery</div>
            {product.stock > 0 ? (
              <>
                <div className="qty-row">
                  <span className="label">Quantity</span>
                  <QtyStepper value={qty} max={maxQty} onChange={setQty} />
                </div>
                <button className="btn btn-block btn-lg" onClick={addToCart} disabled={adding}>
                  {adding ? <Spinner small /> : 'Add to cart'}
                </button>
              </>
            ) : (
              <button className="btn btn-block btn-lg" disabled>Out of stock</button>
            )}
          </div>

          <div className="description">
            <h2 className="section-title">About this item</h2>
            <p className="pre-line">{product.description}</p>
          </div>
        </div>
      </div>

      <section className="section reviews">
        <h2 className="section-title">Customer reviews</h2>
        {!reviews ? (
          <Loading text="Loading reviews…" />
        ) : reviews.length === 0 ? (
          <p className="muted">No reviews yet. Reviews can be written by buyers after delivery.</p>
        ) : (
          <div className="review-list">
            {reviews.map((r) => (
              <article key={r.id} className="review card">
                <div className="review-head">
                  <span className="avatar">{(r.buyer_name || '?').charAt(0).toUpperCase()}</span>
                  <div>
                    <strong>{r.buyer_name}</strong>
                    <div className="muted small">{formatDate(r.created_at)}</div>
                  </div>
                </div>
                <Stars value={r.rating} />
                {r.body && <p className="pre-line">{r.body}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function QtyStepper({ value, max, onChange, disabled }) {
  const set = (v) => {
    const n = Math.max(1, Math.min(max, Number(v) || 1));
    onChange(n);
  };
  return (
    <div className="qty-stepper">
      <button type="button" onClick={() => set(value - 1)} disabled={disabled || value <= 1} aria-label="Decrease quantity">−</button>
      <input
        type="number"
        min="1"
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => set(e.target.value)}
        aria-label="Quantity"
      />
      <button type="button" onClick={() => set(value + 1)} disabled={disabled || value >= max} aria-label="Increase quantity">+</button>
    </div>
  );
}
