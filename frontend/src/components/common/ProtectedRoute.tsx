import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { can, hasWorkspace } from '../../lib/permissions';
import type { Permission } from '../../types';
import { EmptyState, LoadingState } from './States';

/**
 * UX guards only: they keep people away from screens that would fail anyway. Every
 * protected operation is authorised by the API itself.
 */
export const ProtectedRoute = ({ workspace = false }: { workspace?: boolean }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (workspace && !hasWorkspace(user)) return <Navigate to="/" replace />;
  return <Outlet />;
};

/** Inside the workspace: admin-only screens, or screens that need one permission. */
export const RequireAccess = ({ permission, adminOnly = false }: { permission?: Permission; adminOnly?: boolean }) => {
  const { user } = useAuth();
  const allowed = adminOnly ? user?.role === 'admin' : permission ? can(user, permission) : true;
  if (!allowed) {
    return (
      <EmptyState title="Not available to your account" className="py-20">
        An administrator can grant access if you need it.
      </EmptyState>
    );
  }
  return <Outlet />;
};
