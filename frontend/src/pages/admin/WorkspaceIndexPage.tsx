import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { visibleNav } from '../../lib/workspaceNav';
import { EmptyState } from '../../components/common/States';
import { AdminOverviewPage } from './AdminOverviewPage';

/** Admins land on the overview; staff go to the first tool they have been granted. */
export const WorkspaceIndexPage = () => {
  const { user } = useAuth();
  if (user?.role === 'admin') return <AdminOverviewPage />;
  const first = visibleNav(user)[0];
  if (first) return <Navigate to={first.to} replace />;
  return (
    <EmptyState title="No tools assigned yet" className="py-20">
      An administrator hasn’t granted your staff account any permissions yet.
    </EmptyState>
  );
};
