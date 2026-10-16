import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { errorMessage, fieldErrors } from '../../api/client';
import { Notice } from '../../components/common/States';
import { AuthShell, Divider, SocialButtons } from './AuthShell';

type Field = 'name' | 'email' | 'password' | 'confirm';

const validate = (v: Record<Field, string>): Partial<Record<Field, string>> => {
  const errors: Partial<Record<Field, string>> = {};
  if (v.name.trim().length < 2) errors.name = 'Enter at least 2 characters.';
  if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) errors.email = 'Enter a valid email address.';
  if (v.password.length < 8) errors.password = 'Use at least 8 characters.';
  else if (v.password.length > 72) errors.password = 'Use at most 72 characters.';
  if (v.confirm !== v.password) errors.confirm = 'Passwords do not match.';
  return errors;
};

export const RegisterPage = () => {
  const { user, register } = useAuth();
  const [values, setValues] = useState<Record<Field, string>>({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Signed-in visitors go home; a brand-new account goes straight to the editor
  const [destination, setDestination] = useState('/');

  useEffect(() => {
    document.title = 'Join — Margin';
  }, []);

  if (user) return <Navigate to={destination} replace />;

  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    if (errors[field]) setErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      // No role is ever sent: the API always creates regular accounts
      setDestination('/write');
      await register({ name: values.name.trim(), email: values.email.trim(), password: values.password });
    } catch (err) {
      setDestination('/');
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const input = (field: Field, label: string, type: string, autoComplete: string, hint?: string) => (
    <div>
      <label htmlFor={field} className="field-label">
        {label}
      </label>
      <input
        id={field}
        type={type}
        autoComplete={autoComplete}
        className="field"
        value={values[field]}
        onChange={set(field)}
        aria-invalid={Boolean(errors[field])}
        aria-describedby={errors[field] ? `${field}-error` : hint ? `${field}-hint` : undefined}
      />
      {errors[field] ? (
        <p id={`${field}-error`} className="field-error">
          {errors[field]}
        </p>
      ) : (
        hint && (
          <p id={`${field}-hint`} className="field-hint">
            {hint}
          </p>
        )
      )}
    </div>
  );

  return (
    <AuthShell
      title="Join Margin"
      intro="Write long-form, publish when you’re ready."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="link font-medium">
            Sign in
          </Link>
        </>
      }
    >
      <SocialButtons />
      <Divider label="or with email" />
      <form onSubmit={submit} noValidate className="space-y-4">
        {input('name', 'Name', 'text', 'name', 'Shown on your articles and responses.')}
        {input('email', 'Email', 'email', 'email')}
        {input('password', 'Password', 'password', 'new-password', 'At least 8 characters.')}
        {input('confirm', 'Confirm password', 'password', 'new-password')}
        {formError && !Object.values(errors).some(Boolean) && <Notice>{formError}</Notice>}
        <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
};
