import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LoadingState } from '../../components/common/States';

/**
 * The API redirects here after a successful OAuth sign-in, having set the HttpOnly
 * refresh cookie. Exchanging it for an access token completes the sign-in.
 */
export const OAuthCallbackPage = () => {
  const { restoreSession } = useAuth();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    restoreSession().then((ok) => navigate(ok ? '/' : '/login?oauth_error=failed', { replace: true }));
  }, [restoreSession, navigate]);

  return <LoadingState label="Finishing sign-in…" className="py-32" />;
};
