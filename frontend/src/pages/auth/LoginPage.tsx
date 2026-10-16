import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../api/client';
import { Notice } from '../../components/common/States';
import { AuthShell, Divider, SocialButtons } from './AuthShell';

const OAUTH_ERRORS: Record<string, string> = {
  unavailable: 'sign-in is not configured on this server yet.',
  cancelled: 'sign-in was cancelled.',
  state: 'sign-in could not be verified. Please try again.',
  oauth_email_required: 'did not share an email address, which Margin needs to create your account.',
  oauth_email_unverified: 'reported an unverified email address. Verify it with the provider and try again.',
  account_disabled: 'sign-in worked, but this Margin account has been deactivated.',
  failed: 'sign-in failed. Please try again.',
};

const providerName = (p: string | null) => (p === 'facebook' ? 'Facebook' : 'Google');

export const LoginPage = () => {
  const { user, login } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const from = (location.state as { from?: string } | null)?.from || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Sign in — Margin';
  }, []);

  const oauthError = params.get('oauth_error');
  const oauthMessage = oauthError
    ? `${providerName(params.get('provider'))} ${OAUTH_ERRORS[oauthError] ?? OAUTH_ERRORS.failed}`
    : null;

  if (user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setSubmitting(true);
    setError(null);
    try {
      // Setting the user re-renders this page, and the <Navigate> above sends them on
      await login({ email: email.trim(), password });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      intro="Sign in to write, respond and keep up with your drafts."
      footer={
        <>
          New to Margin?{' '}
          <Link to="/register" className="link font-medium">
            Create an account
          </Link>
        </>
      }
    >
      {oauthMessage && (
        <div className="mb-5">
          <Notice>{oauthMessage}</Notice>
        </div>
      )}
      <SocialButtons />
      <Divider label="or with email" />
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input id="email" type="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <Notice>{error}</Notice>}
        <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
};
