import { Link } from 'react-router-dom';
import { EmptyState } from '../components/common/States';

export const NotFoundPage = () => (
  <EmptyState title="Page not found" className="py-32" action={<Link to="/" className="btn btn-outline">Back to the front page</Link>}>
    The page you were looking for doesn’t exist or has moved.
  </EmptyState>
);
