import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ProductGrid } from '../components/ProductCard.jsx';
import { Empty, ErrorState, Loading } from '../components/ui.jsx';

const CAT_ICONS = ['🍑', '👗', '📱', '🏠', '🧸', '📚', '💄', '⚽', '🍷', '🛠️', '🎁', '🪴'];

export default function Home() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    setProducts(null);
    api.get('/products?sort=newest&limit=20')
      .then((d) => setProducts(d.items || []))
      .catch(setError);
  }, []);

  useEffect(() => {
    load();
    api.get('/categories').then((d) => setCategories(d.categories || [])).catch(() => {});
  }, [load]);

  return (
    <div>
      <section className="hero">
        <div className="container hero-inner">
          <div>
            <h1>Everything Armenia makes, <span className="accent-text">delivered to your door.</span></h1>
            <p>Shop from local stores across all 11 regions. Pay in cash when your order arrives — no cards needed.</p>
            <div className="hero-actions">
              <Link to="/search" className="btn btn-lg">Start shopping</Link>
              <Link to="/seller/activate" className="btn btn-ghost-light btn-lg">Sell on Shuka</Link>
            </div>
          </div>
          <div className="hero-badges">
            <div className="hero-badge"><strong>💵</strong><span>Cash on delivery</span></div>
            <div className="hero-badge"><strong>🚚</strong><span>All 11 regions</span></div>
            <div className="hero-badge"><strong>🏪</strong><span>Local sellers</span></div>
          </div>
        </div>
      </section>

      <div className="container">
        {categories.length > 0 && (
          <section className="section">
            <h2 className="section-title">Shop by category</h2>
            <div className="cat-cards">
              {categories.map((c, i) => (
                <Link key={c.id} to={`/search?category=${encodeURIComponent(c.slug)}`} className="cat-card">
                  <span className="cat-icon">{CAT_ICONS[i % CAT_ICONS.length]}</span>
                  <span className="cat-name">{c.name}</span>
                  <span className="muted small">{c.product_count} items</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">New arrivals</h2>
            <Link to="/search?sort=newest">See all →</Link>
          </div>
          {error ? (
            <ErrorState error={error} onRetry={load} />
          ) : !products ? (
            <Loading text="Loading products…" />
          ) : products.length === 0 ? (
            <Empty title="No products yet">
              <p className="muted">Be the first to list something.</p>
              <Link to="/seller/activate" className="btn">Start selling</Link>
            </Empty>
          ) : (
            <ProductGrid products={products} />
          )}
        </section>
      </div>
    </div>
  );
}
