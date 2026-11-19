import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Spinner } from '../components/ui.jsx';
import { Field } from './Checkout.jsx';

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: user.name || '', phone: user.phone || '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    const fe = {};
    if (!form.name.trim()) fe.name = 'Name is required';
    if (!form.phone.trim()) fe.phone = 'Phone is required';
    setErrors(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const d = await api.patch('/me', { name: form.name.trim(), phone: form.phone.trim() });
      setUser(d.user);
      toast.success('Profile saved');
    } catch (err) {
      if (err.details) setErrors(err.details);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container narrow">
      <h1 className="page-title">Your profile</h1>
      <form className="card form-card" onSubmit={submit} noValidate>
        <Field label="Email">
          <input value={user.email} disabled />
        </Field>
        <Field label="Name" error={errors.name}>
          <input value={form.name} onChange={set('name')} autoComplete="name" />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
        </Field>
        <button className="btn" disabled={busy}>{busy ? <Spinner small /> : 'Save changes'}</button>
      </form>
      <div className="card pad profile-links">
        <Link to="/orders">📦 My orders</Link>
        {user.is_seller ? <Link to="/seller">🏪 Seller dashboard — {user.store_name}</Link> : <Link to="/seller/activate">🏪 Start selling on Shuka</Link>}
      </div>
    </div>
  );
}
