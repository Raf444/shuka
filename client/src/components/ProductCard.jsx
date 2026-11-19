import { Link } from 'react-router-dom';
import { formatAmd } from '../format.js';
import { Stars, Thumb } from './ui.jsx';

export default function ProductCard({ product: p }) {
  return (
    <Link to={`/product/${p.id}`} className="product-card">
      <div className="pc-img">
        <Thumb image={p.image} alt={p.title} className="pc-thumb" />
        {p.stock <= 0 && <span className="pc-flag">Out of stock</span>}
      </div>
      <div className="pc-body">
        <div className="pc-title">{p.title}</div>
        <div className="pc-price">{formatAmd(p.price_amd)}</div>
        <Stars value={p.rating_avg} count={p.rating_count} />
        {p.seller && <div className="pc-seller muted small">{p.seller.store_name}</div>}
      </div>
    </Link>
  );
}

export function ProductGrid({ products }) {
  return (
    <div className="product-grid">
      {products.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}
