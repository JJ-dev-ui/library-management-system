import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../api';
import AuthLayout from '../components/AuthLayout';
import LoadingButton from '../components/LoadingButton';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // Form validation
  const validate = () => {
    const e = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email address';
    if (!form.password) e.password = 'Enter your password';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setServerError('');
    if (!validate()) return;
    setBusy(true);
    try {
      await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      // Also shows the 429 answer "Too many failed attempts. Try again in 14 minutes." The button is
      // never locked here: after that time the server accepts attempts again.
      setServerError(errMsg(err));
    } finally { setBusy(false); }
  };

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} noValidate>
        <h2 className="mb-1">Log in</h2>
        <p className="meta mb-4">Log in with your library account.</p>
        {serverError && <div className="alert alert-danger py-2" role="alert">{serverError}</div>}
        <div className="mb-3">
          <label htmlFor="email" className="form-label">Email</label>
          <input id="email" name="email" type="email" className={`form-control ${errors.email ? 'is-invalid' : ''}`} value={form.email} onChange={handleChange} autoComplete="email" />
          <div className="invalid-feedback">{errors.email}</div>
        </div>
        <div className="mb-4">
          <label htmlFor="password" className="form-label">Password</label>
          <input id="password" name="password" type="password" className={`form-control ${errors.password ? 'is-invalid' : ''}`} value={form.password} onChange={handleChange} autoComplete="current-password" />
          <div className="invalid-feedback">{errors.password}</div>
        </div>
        <LoadingButton type="submit" variant="primary" className="w-100" loading={busy} loadingText="Logging in...">Log in</LoadingButton>
        <p className="mt-3 mb-0 meta">New here? <Link to="/register">Create an account</Link></p>
      </form>
    </AuthLayout>
  );
}
