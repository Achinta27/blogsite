import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { RealtimeProvider } from './context/RealtimeContext';
import { RootLayout } from './components/layout/RootLayout';
import { ProtectedRoute, RequireAccess } from './components/common/ProtectedRoute';
import { HomePage } from './pages/HomePage';
import { PostDetailPage } from './pages/PostDetailPage';
import { AuthorPage } from './pages/AuthorPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { OAuthCallbackPage } from './pages/auth/OAuthCallbackPage';
import { DashboardPage } from './pages/DashboardPage';
import { SavedPage } from './pages/SavedPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LoadingState } from './components/common/States';

// The editor (Tiptap/ProseMirror) and the editorial workspace are only needed by some
// visitors, so they are split out of the bundle readers download.
const named = <T extends string>(load: () => Promise<Record<T, React.ComponentType>>, name: T) =>
  lazy(() => load().then((m) => ({ default: m[name] })));

const EditorRoute = named(() => import('./pages/EditorPage'), 'EditorRoute');
const AdminLayout = named(() => import('./components/layout/AdminLayout'), 'AdminLayout');
const WorkspaceIndexPage = named(() => import('./pages/admin/WorkspaceIndexPage'), 'WorkspaceIndexPage');
const ModerationQueuePage = named(() => import('./pages/admin/ModerationQueuePage'), 'ModerationQueuePage');
const ReviewPage = named(() => import('./pages/admin/ReviewPage'), 'ReviewPage');
const AdminPostsPage = named(() => import('./pages/admin/AdminPostsPage'), 'AdminPostsPage');
const AdminCommentsPage = named(() => import('./pages/admin/AdminCommentsPage'), 'AdminCommentsPage');
const TaxonomyPage = named(() => import('./pages/admin/TaxonomyPage'), 'TaxonomyPage');
const AdminUsersPage = named(() => import('./pages/admin/AdminUsersPage'), 'AdminUsersPage');
const StaffPage = named(() => import('./pages/admin/StaffPage'), 'StaffPage');
const StaffDetailPage = named(() => import('./pages/admin/StaffDetailPage'), 'StaffDetailPage');
const AuditLogPage = named(() => import('./pages/admin/AuditLogPage'), 'AuditLogPage');

export const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <RealtimeProvider>
        <Suspense fallback={<LoadingState className="py-32" />}>
          <Routes>
            <Route element={<RootLayout />}>
              <Route index element={<HomePage />} />
              <Route path="post/:slug" element={<PostDetailPage />} />
              <Route path="authors/:id" element={<AuthorPage />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />
              <Route path="auth/callback" element={<OAuthCallbackPage />} />

              <Route element={<ProtectedRoute />}>
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="write/:slug?" element={<EditorRoute />} />
                <Route path="saved" element={<SavedPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Route>

            {/* Editorial workspace: admins, and staff limited to their granted tools */}
            <Route element={<ProtectedRoute workspace />}>
              <Route path="admin" element={<AdminLayout />}>
                <Route index element={<WorkspaceIndexPage />} />
                <Route element={<RequireAccess permission="posts.review" />}>
                  <Route path="moderation" element={<ModerationQueuePage />} />
                  <Route path="moderation/:id" element={<ReviewPage />} />
                </Route>
                <Route element={<RequireAccess permission="comments.moderate" />}>
                  <Route path="comments" element={<AdminCommentsPage />} />
                </Route>
                <Route element={<RequireAccess permission="categories.manage" />}>
                  <Route path="taxonomy" element={<TaxonomyPage />} />
                </Route>
                <Route element={<RequireAccess permission="audit_logs.view" />}>
                  <Route path="audit" element={<AuditLogPage />} />
                </Route>
                <Route element={<RequireAccess adminOnly />}>
                  <Route path="posts" element={<AdminPostsPage />} />
                  <Route path="users" element={<AdminUsersPage />} />
                  <Route path="staff" element={<StaffPage />} />
                  <Route path="staff/:id" element={<StaffDetailPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </RealtimeProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
