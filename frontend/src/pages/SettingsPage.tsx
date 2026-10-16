import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api';
import { errorMessage, fieldErrors } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/common/Avatar';
import { Notice } from '../components/common/States';

export const SettingsPage = () => {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    document.title = 'Settings — Margin';
  }, []);

  if (!user) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    if (name.trim().length < 2) return setErrors({ name: 'Enter at least 2 characters.' });
    setSaving(true);
    try {
      setUser(await authApi.updateMe({ name: name.trim(), bio: bio.trim() }));
      setErrors({});
      setNotice({ tone: 'ok', text: 'Profile saved.' });
    } catch (err) {
      setErrors(fieldErrors(err));
      setNotice({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wrap py-12">
      <div className="mx-auto max-w-xl">
        <p className="kicker text-muted">Account</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-[-0.015em]">Settings</h1>

        <form onSubmit={submit} className="card mt-8 space-y-5 p-6 sm:p-8" noValidate>
          <div className="flex items-center gap-4">
            <Avatar name={user.name} src={user.avatar} size="lg" />
            <div className="text-sm">
              <p className="font-medium text-ink">{user.email}</p>
              <p className="text-muted">
                Your email is private.{' '}
                <Link to={`/authors/${user._id}`} className="link">
                  View public profile
                </Link>
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="name" className="field-label">
              Display name
            </label>
            <input
              id="name"
              className="field"
              value={name}
              maxLength={50}
              aria-invalid={Boolean(errors.name)}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && <p className="field-error">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="bio" className="field-label">
              Short bio
            </label>
            <textarea
              id="bio"
              className="field min-h-24"
              value={bio}
              maxLength={280}
              aria-describedby="bio-hint"
              onChange={(e) => setBio(e.target.value)}
            />
            <p id="bio-hint" className="field-hint">
              Shown on your articles and profile. {bio.length}/280
            </p>
          </div>

          {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </div>
    </div>
  );
};
