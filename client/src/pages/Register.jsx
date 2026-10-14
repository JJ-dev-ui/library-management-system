import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../api';
import AuthLayout from '../components/AuthLayout';
import LoadingButton from '../components/LoadingButton';
import { MEMBER } from '../utils/limits';

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Enter your name';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email address';
    if (form.password.length < MEMBER.passwordMin) e.password = `Use at least ${MEMBER.passwordMin} characters`;
    if (form.confirm !== form.password) e.confirm = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setServerError('');
    if (!validate()) return;
    setBusy(true);
    try {
      await register(form.name.trim(), form.email, form.password);
      navigate('/');
    } catch (err) {
      setServerError(errMsg(err));
    } finally { setBusy(false); }
  };

  // maxLength = the same limits as the server (name 80, email 254, password 72)
  const LIMITS = { name: MEMBER.name, email: MEMBER.email, password: MEMBER.passwordMax, confirm: MEMBER.passwordMax };
  const field = (name, label, type = 'text', auto) => (
    <div className="mb-3">
      <label htmlFor={name} className="form-label">{label}</label>
      <input id={name} name={name} type={type} autoComplete={auto} maxLength={LIMITS[name]} className={`form-control ${errors[name] ? 'is-invalid' : ''}`} value={form[name]} onChange={handleChange} />
      <div className="invalid-feedback">{errors[name]}</div>
    </div>
  );

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} noValidate>
        <h2 className="mb-1">Create account</h2>
        <p className="meta mb-4">Members can borrow up to 5 books for 14 days.</p>
        {serverError && <div className="alert alert-danger py-2" role="alert">{serverError}</div>}
        {field('name', 'Full name', 'text', 'name')}
        {field('email', 'Email', 'email', 'email')}
        {field('password', 'Password', 'password', 'new-password')}
        {field('confirm', 'Confirm password', 'password', 'new-password')}
        <LoadingButton type="submit" variant="primary" className="w-100" loading={busy} loadingText="Creating account...">Create account</LoadingButton>
        <p className="mt-3 mb-0 meta">Already registered? <Link to="/login">Log in</Link></p>
      </form>
    </AuthLayout>
  );
}
