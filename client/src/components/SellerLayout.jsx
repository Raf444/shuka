import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function SellerLayout() {
  const { user } = useAuth();
  return (
    <div className="container seller-layout">
      <div className="seller-head">
        <div className="muted small">Seller dashboard</div>
        <h1 className="page-title">{user?.store_name || 'My store'}</h1>
      </div>
      <nav className="tabs seller-tabs">
        <NavLink end to="/seller">Overview</NavLink>
        <NavLink to="/seller/products">Products</NavLink>
        <NavLink to="/seller/orders">Orders</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
