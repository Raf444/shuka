import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from './AuthContext.jsx';

const CartCtx = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) { setCount(0); return null; }
    try {
      const cart = await api.get('/cart');
      setCount(cart.count || 0);
      return cart;
    } catch {
      return null;
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Pages that already have a fresh cart object can just push it here.
  const setFromCart = useCallback((cart) => { if (cart) setCount(cart.count || 0); }, []);

  return <CartCtx.Provider value={{ count, refresh, setFromCart }}>{children}</CartCtx.Provider>;
}

export const useCart = () => useContext(CartCtx);
