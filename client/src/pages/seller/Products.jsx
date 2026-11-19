import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatAmd } from '../../format.js';
import { Empty, ErrorState, Loading, Spinner, Thumb } from '../../components/ui.jsx';

export default function SellerProducts() {
  const toast = useToast();
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api.get('/seller/products').then((d) => setProducts(d.products || [])).catch(setError);
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (p) => {
    setBusy(p.id);
    try {
      await api.patch(`/seller/products/${p.id}`, { is_published: !p.is_published });
      setProducts((list) => list.map((x) => (x.id === p.id ? { ...x, is_published: !p.is_published } : x)));
      toast.success(p.is_published ? 'Product moved to drafts' : 'Product published');
    } catch (e) {
      toast.error(e.code === 'NO_IMAGES' ? 'Add at least one image before publishing' : e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="toolbar">
        <h2 className="section-title">Products {products && <span className="muted">({products.length})</span>}</h2>
        <Link to="/seller/products/new" className="btn">+ Add product</Link>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !products ? (
        <Loading />
      ) : products.length === 0 ? (
        <Empty icon="🏷️" title="No products yet">
          <p className="muted">Add your first product to start selling.</p>
          <Link to="/seller/products/new" className="btn">Add product</Link>
        </Empty>
      ) : (
        <div className="card table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Sold</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td data-label="Product">
                    <div className="prod-cell">
                      <Thumb image={p.image} className="tbl-thumb" alt={p.title} />
                      <div>
                        <Link to={`/product/${p.id}`} className="ci-title">{p.title}</Link>
                        <div className="muted small">{p.category?.name}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Price">{formatAmd(p.price_amd)}</td>
                  <td data-label="Stock">
                    <span className={p.stock === 0 ? 'text-danger' : p.stock <= 5 ? 'text-warn' : ''}>{p.stock}</span>
                  </td>
                  <td data-label="Status">
                    <span className={'badge ' + (p.is_published ? 'badge-pub' : 'badge-draft')}>{p.is_published ? 'Published' : 'Draft'}</span>
                  </td>
                  <td data-label="Sold">{p.units_sold ?? 0}</td>
                  <td className="actions-cell">
                    <Link to={`/seller/products/${p.id}/edit`} className="btn btn-sm btn-outline">Edit</Link>
                    <button className="btn btn-sm btn-outline" onClick={() => toggle(p)} disabled={busy === p.id}>
                      {busy === p.id ? <Spinner small /> : p.is_published ? 'Unpublish' : 'Publish'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
