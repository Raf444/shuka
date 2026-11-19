import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import Header from './components/Header.jsx';
import { RequireAuth, RequireSeller } from './components/Guards.jsx';
import SellerLayout from './components/SellerLayout.jsx';
import Home from './pages/Home.jsx';
import Search from './pages/Search.jsx';
import Product from './pages/Product.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import Orders from './pages/Orders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import { Login, Register } from './pages/Auth.jsx';
import Profile from './pages/Profile.jsx';
import NotFound from './pages/NotFound.jsx';
import Activate from './pages/seller/Activate.jsx';
import Overview from './pages/seller/Overview.jsx';
import SellerProducts from './pages/seller/Products.jsx';
import ProductEditor from './pages/seller/ProductEditor.jsx';
import SellerOrders from './pages/seller/Orders.jsx';
import SellerOrderDetail from './pages/seller/OrderDetail.jsx';

function CategoryRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/search?category=${encodeURIComponent(slug)}`} replace />;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <div className="app">
      <ScrollToTop />
      <Header />
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/category/:slug" element={<CategoryRedirect />} />
          <Route path="/product/:id" element={<Product />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/cart" element={<RequireAuth><Cart /></RequireAuth>} />
          <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
          <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
          <Route path="/orders/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/seller/activate" element={<RequireAuth><Activate /></RequireAuth>} />
          <Route path="/seller" element={<RequireSeller><SellerLayout /></RequireSeller>}>
            <Route index element={<Overview />} />
            <Route path="products" element={<SellerProducts />} />
            <Route path="products/new" element={<ProductEditor />} />
            <Route path="products/:id/edit" element={<ProductEditor />} />
            <Route path="orders" element={<SellerOrders />} />
            <Route path="orders/:id" element={<SellerOrderDetail />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <div>
            <span className="logo-text">Shuka</span>
            <span className="muted"> — the Armenian marketplace. Cash on delivery across all 11 regions.</span>
          </div>
          <div className="footer-links">
            <Link to="/search">All products</Link>
            <Link to="/seller/activate">Sell on Shuka</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
