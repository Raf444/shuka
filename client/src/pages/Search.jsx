import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { ProductGrid } from '../components/ProductCard.jsx';
import { Empty, ErrorState, Loading } from '../components/ui.jsx';

const SORTS = [
  ['newest', 'Newest'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Top rated'],
];
const LIMIT = 24;

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const minPrice = params.get('minPrice') || '';
  const maxPrice = params.get('maxPrice') || '';
  const sort = params.get('sort') || 'newest';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);

  const [categories, setCategories] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [priceFrom, setPriceFrom] = useState(minPrice);
  const [priceTo, setPriceTo] = useState(maxPrice);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => { setPriceFrom(minPrice); setPriceTo(maxPrice); }, [minPrice, maxPrice]);

  useEffect(() => {
    api.get('/categories').then((d) => setCategories(d.categories || [])).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    api.get('/products' + qs({ q, category, minPrice, maxPrice, sort, page, limit: LIMIT }))
      .then(setData)
      .catch(setError);
  }, [q, category, minPrice, maxPrice, sort, page]);

  useEffect(() => { load(); }, [load]);

  // Update params; any filter change resets to page 1.
  const update = (changes, keepPage = false) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => {
      if (v === '' || v === null || v === undefined) next.delete(k);
      else next.set(k, String(v));
    });
    if (!keepPage) next.delete('page');
    setParams(next);
  };

  const applyPrice = (e) => {
    e.preventDefault();
    update({ minPrice: priceFrom.trim(), maxPrice: priceTo.trim() });
    setFiltersOpen(false);
  };

  const goPage = (p) => {
    update({ page: p === 1 ? '' : p }, true);
    window.scrollTo(0, 0);
  };

  const catName = categories.find((c) => c.slug === category)?.name;
  const heading = q ? `Results for “${q}”` : catName || 'All products';
  const hasFilters = q || category || minPrice || maxPrice;

  return (
    <div className="container search-page">
      <div className="search-head">
        <div>
          <h1 className="page-title">{heading}</h1>
          <div className="muted">
            {data ? `${data.total} ${data.total === 1 ? 'product' : 'products'}` : ' '}
            {q && catName ? ` in ${catName}` : ''}
          </div>
        </div>
        <div className="search-controls">
          <button className="btn btn-outline filter-toggle" onClick={() => setFiltersOpen((o) => !o)}>
            Filters{(category || minPrice || maxPrice) ? ' •' : ''}
          </button>
          <label className="sort-label">
            <span className="muted small">Sort by</span>
            <select value={sort} onChange={(e) => update({ sort: e.target.value === 'newest' ? '' : e.target.value })}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="search-layout">
        <aside className={'filters card' + (filtersOpen ? ' open' : '')}>
          <div className="filter-block">
            <label className="label" htmlFor="f-cat">Category</label>
            <select id="f-cat" value={category} onChange={(e) => { update({ category: e.target.value }); setFiltersOpen(false); }}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <form className="filter-block" onSubmit={applyPrice}>
            <span className="label">Price (֏)</span>
            <div className="price-range">
              <input type="number" min="0" inputMode="numeric" placeholder="From" value={priceFrom} onChange={(e) => setPriceFrom(e.target.value)} aria-label="Minimum price" />
              <span className="muted">–</span>
              <input type="number" min="0" inputMode="numeric" placeholder="To" value={priceTo} onChange={(e) => setPriceTo(e.target.value)} aria-label="Maximum price" />
            </div>
            <button className="btn btn-sm btn-block" type="submit">Apply</button>
          </form>
          {hasFilters && (
            <Link to="/search" className="clear-link" onClick={() => setFiltersOpen(false)}>Clear all filters</Link>
          )}
        </aside>

        <section className="results">
          {error ? (
            <ErrorState error={error} onRetry={load} />
          ) : !data ? (
            <Loading text="Searching…" />
          ) : data.items.length === 0 ? (
            <Empty icon="🔍" title="No products found">
              <p className="muted">Try a different search or remove some filters.</p>
              <Link to="/search" className="btn">Browse all products</Link>
            </Empty>
          ) : (
            <>
              <ProductGrid products={data.items} />
              {data.pages > 1 && <Pagination page={data.page || page} pages={data.pages} onGo={goPage} />}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Pagination({ page, pages, onGo }) {
  const nums = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(pages, page + 2);
  if (from > 1) nums.push(1);
  if (from > 2) nums.push('…a');
  for (let i = from; i <= to; i++) nums.push(i);
  if (to < pages - 1) nums.push('…b');
  if (to < pages) nums.push(pages);
  return (
    <nav className="pagination" aria-label="Pagination">
      <button disabled={page <= 1} onClick={() => onGo(page - 1)}>‹ Prev</button>
      {nums.map((n) =>
        typeof n === 'number' ? (
          <button key={n} className={n === page ? 'active' : ''} onClick={() => onGo(n)} aria-current={n === page ? 'page' : undefined}>{n}</button>
        ) : (
          <span key={n} className="muted">…</span>
        )
      )}
      <button disabled={page >= pages} onClick={() => onGo(page + 1)}>Next ›</button>
    </nav>
  );
}
