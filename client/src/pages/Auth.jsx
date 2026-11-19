import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Spinner } from '../components/ui.jsx';
import { Field } from './Checkout.jsx';

function useFrom() {
  const loc = useLocation();
  const from = loc.state && loc.state.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('/login') && !from.startsWith('/register') ? from : '/';
}

export function Login() {
  const { user, login, loading } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const from = useFrom();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user && !busy) return <Navigate to={from} replace />;

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    const fe = {};
    if (!form.email.trim()) fe.email = 'Email is required';
    if (!form.password) fe.password = 'Password is required';
    setErrors(fe);
    setFormError('');
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const u = await login(form.email.trim(), form.password);
      toast.success(`Welcome back, ${u.name}!`);
      nav(from, { replace: true });
    } catch (err) {
      setBusy(false);
      if (err.details) setErrors(err.details);
      setFormError(err.message);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <h1 className="page-title">Log in</h1>
        <p className="muted">Welcome back to Shuka.</p>
        {formError && <div className="banner banner-error compact">{formError}</div>}
        <Field label="Email" error={errors.email}>
          <input type="email" value={form.email} onChange={set('email')} autoComplete="email" autoFocus />
        </Field>
        <Field label="Password" error={errors.password}>
          <input type="password" value={form.password} onChange={set('password')} autoComplete="current-password" />
        </Field>
        <button className="btn btn-block btn-lg" disabled={busy}>{busy ? <Spinner small /> : 'Log in'}</button>
        <p className="center small">New to Shuka? <Link to="/register" state={{ from }}>Create an account</Link></p>
      </form>
    </div>
  );
}

export function Register() {
  const { user, register, loading } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const from = useFrom();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user && !busy) return <Navigate to={from} replace />;

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    const fe = {};
    if (!form.name.trim()) fe.name = 'Name is required';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) fe.email = 'Enter a valid email';
    if (!form.phone.trim()) fe.phone = 'Phone is required';
    if (form.password.length < 6) fe.password = 'Password must be at least 6 characters';
    setErrors(fe);
    setFormError('');
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const u = await register({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), password: form.password });
      toast.success(`Welcome to Shuka, ${u.name}!`);
      nav(from, { replace: true });
    } catch (err) {
      setBusy(false);
      if (err.details) setErrors(err.details);
      setFormError(err.message);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <h1 className="page-title">Create account</h1>
        <p className="muted">Shop from local stores and pay on delivery.</p>
        {formError && <div className="banner banner-error compact">{formError}</div>}
        <Field label="Your name" error={errors.name}>
          <input value={form.name} onChange={set('name')} autoComplete="name" autoFocus />
        </Field>
        <Field label="Email" error={errors.email}>
          <input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="+374 XX XXX XXX" />
        </Field>
        <Field label="Password" error={errors.password}>
          <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" placeholder="At least 6 characters" />
        </Field>
        <button className="btn btn-block btn-lg" disabled={busy}>{busy ? <Spinner small /> : 'Create account'}</button>
        <p className="center small">Already have an account? <Link to="/login" state={{ from }}>Log in</Link></p>
      </form>
    </div>
  );
}
