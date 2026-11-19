import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function Header() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [categories, setCategories] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    api.get('/categories').then((d) => setCategories(d.categories || [])).catch(() => {});
  }, []);

  // Keep the search box in sync with the URL when on /search
  useEffect(() => {
    if (loc.pathname === '/search') setQ(params.get('q') || '');
  }, [loc.pathname, params]);

  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const submit = (e) => {
    e.preventDefault();
    const s = new URLSearchParams();
    if (q.trim()) s.set('q', q.trim());
    const str = s.toString();
    nav('/search' + (str ? '?' + str : ''));
  };

  const doLogout = async () => {
    setMenuOpen(false);
    await logout();
    toast.success('You have been logged out');
    nav('/');
  };

  const activeCat = loc.pathname === '/search' ? params.get('category') : null;

  return (
    <header className="site-header">
      <div className="header-main container">
        <Link to="/" className="logo" aria-label="Shuka home">
          <span className="logo-mark">S</span>
          <span className="logo-text">Shuka</span>
        </Link>

        <form className="search" onSubmit={submit} role="search">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
            aria-label="Search products"
          />
          <button type="submit" aria-label="Search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </button>
        </form>

        <div className="header-actions">
          {user ? (
            <div className="account" ref={menuRef}>
              <button className="account-btn" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
                <span className="small-label">Hello, {(user.name || 'there').split(' ')[0]}</span>
                <span className="strong-label">Account ▾</span>
              </button>
              {menuOpen && (
                <div className="menu">
                  <Link to="/orders">My orders</Link>
                  {user.is_seller ? (
                    <Link to="/seller">Seller dashboard</Link>
                  ) : (
                    <Link to="/seller/activate">Sell on Shuka</Link>
                  )}
                  <Link to="/profile">Profile</Link>
                  <button onClick={doLogout}>Log out</button>
                </div>
              )}
            </div>
          ) : (
            <div className="guest-links">
              <Link to="/login" state={{ from: loc.pathname + loc.search }}>Log in</Link>
              <Link to="/register" className="btn btn-sm">Register</Link>
            </div>
          )}
          <Link to="/cart" className="cart-link" aria-label={`Cart, ${count} items`}>
            <span className="cart-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.6 12.4a1.5 1.5 0 0 0 1.5 1.1h8.8a1.5 1.5 0 0 0 1.5-1.1L21 7H6" /></svg>
              {count > 0 && <span className="cart-count">{count > 99 ? '99+' : count}</span>}
            </span>
            <span className="cart-label">Cart</span>
          </Link>
        </div>
      </div>
      <nav className="cat-bar" aria-label="Categories">
        <div className="container cat-scroll">
          <Link to="/search" className={loc.pathname === '/search' && !activeCat ? 'active' : ''}>All products</Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              to={`/search?category=${encodeURIComponent(c.slug)}`}
              className={activeCat === c.slug ? 'active' : ''}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
