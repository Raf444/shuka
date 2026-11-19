import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Spinner } from '../../components/ui.jsx';
import { Field } from '../Checkout.jsx';

export default function Activate() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [form, setForm] = useState({ store_name: '', phone: user?.phone || '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  if (user?.is_seller && !busy) return <Navigate to="/seller" replace />;

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    const fe = {};
    if (form.store_name.trim().length < 2) fe.store_name = 'Store name must be at least 2 characters';
    if (!form.phone.trim()) fe.phone = 'Phone is required';
    setErrors(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const d = await api.post('/seller/activate', { store_name: form.store_name.trim(), phone: form.phone.trim() });
      setUser(d.user);
      toast.success('Your store is ready!');
      nav('/seller', { replace: true });
    } catch (err) {
      setBusy(false);
      if (err.details) setErrors(err.details);
      else if (err.code === 'STORE_NAME_TAKEN') setErrors({ store_name: err.message });
      toast.error(err.message);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <div className="activate-icon">🏪</div>
        <h1 className="page-title">Sell on Shuka</h1>
        <p className="muted">Open your store in a minute. Buyers pay in cash on delivery — you ship, they pay the courier.</p>
        <Field label="Store name" error={errors.store_name}>
          <input value={form.store_name} onChange={set('store_name')} autoFocus placeholder="e.g. Ararat Apricots" />
        </Field>
        <Field label="Contact phone" error={errors.phone}>
          <input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
        </Field>
        <button className="btn btn-block btn-lg" disabled={busy}>{busy ? <Spinner small /> : 'Open my store'}</button>
      </form>
    </div>
  );
}
