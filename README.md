# Margin

Margin is an editorial blog platform. Writers draft articles and submit them for review, editors approve or reject them, and readers browse, like, save and respond. Every editorial and administrative decision is recorded in an append-only audit log, and the people involved are notified, both live and persistently.

It is built with React 19 (Vite, Tailwind CSS v4, Tiptap), Express, MongoDB/Mongoose and Socket.IO, all in TypeScript.

---

## Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Installation](#installation)
4. [Environment](#environment)
5. [Database, admin seed and demo accounts](#database-admin-seed-and-demo-accounts)
6. [Roles and permissions](#roles-and-permissions)
7. [Publishing workflow](#publishing-workflow)
8. [Audit log](#audit-log)
9. [Notifications and Socket.IO](#notifications-and-socketio)
10. [API reference](#api-reference)
11. [Testing](#testing)
12. [Deployment](#deployment)
13. [Known limitations](#known-limitations)

---

## Features

- **Accounts:**
  - Email/password sign-up and sign-in, plus Google and Facebook through Passport.
  - A 15-minute access token held in memory, and a 7-day refresh token in an HttpOnly cookie that rotates on every use. A reused token revokes the session.
  - Public sign-up always creates a regular `user`.
- **Three roles, plus granular staff permissions.** Every rule is enforced by the API on every request. Role, permissions and account status are re-read from the database each time, so a revoked permission applies to the very next call.
- **Moderated publishing:** `draft → pending_review → published`, with `rejected` (a reason is required) and `archived`. Edits to a published article become a revision that must be approved, while readers keep seeing the live version.
- **Content:**
  - A rich-text editor (Tiptap) whose output is sanitised on the server and again in the browser.
  - Cover images uploaded through `express-fileupload` to Cloudinary, after size and magic-byte checks.
  - Managed categories, normalised tags, full-text search, and filters by category, tag and author with pagination.
- **Engagement:**
  - Likes and bookmarks, unique per user and post at the database level. Authors cannot like their own work.
  - Comments, with edit and delete restricted to their authors, and moderation for staff who hold the permission.
- **Notifications:** persisted in MongoDB first, then pushed live over Socket.IO, with read state, an unread count and pagination.
- **Audit log:** immutable records of who did what, with previous and new state, the reason and a request ID. Status changes and their audit entries are written in one transaction.
- **Workspace:**
  - The admin overview, users, staff management with a permission matrix, the review queue, all posts, comments, categories and tags, and the audit log.
  - Staff see only the sections their permissions unlock.

---

## Architecture

```
backend/src
  config/        env validation (Zod), MongoDB, Passport, permission definitions
  routes/        /api/v1 routers (auth, posts, comments, categories, tags, authors,
                 notifications, moderation, admin)
  middlewares/   requestId, authenticate/optionalAuth, authorize(role),
                 requirePermission(p), validateRequest(zod), rate limits,
                 trusted-origin check, cover upload, activity log, errors
  controllers/   HTTP only: validated input → service → response
  services/      business rules: post lifecycle, moderation, engagement,
                 comments, notifications, taxonomy, admin, audit, auth
  socket/        index.ts (authenticated Socket.IO server, rooms)
                 realtime.ts (the single place services emit live events from)
  models/        User, Session, Post (+ revision), Category, Comment, Like,
                 Bookmark, Notification, AuditLog
  utils/         jwt, slug, sanitising, Cloudinary, image signatures, transactions
  scripts/       seedAdmin, seedCategories, migrateLegacyPosts
backend/tests    Jest + Supertest + socket.io-client against an in-memory replica set

frontend/src
  api/           axios client (in-memory access token, single-flight refresh) + endpoints
  context/       AuthContext, RealtimeContext (socket, notification badge, recovery)
  components/    layout, common UI, post components, editor
  pages/         public, writer workspace, editorial workspace (lazy-loaded)
  lib/           permissions, workspace navigation, audit wording, formatting, hooks
```

A request passes through `route → middleware (auth → permission or role → validation) → controller → service → model`. Errors have one shape:

```json
{ "success": false, "message": "Missing permission: posts.approve", "error": { "code": "FORBIDDEN" } }
```

### REST writes, Socket.IO delivers

REST is the only way to change data, and MongoDB is the source of truth. Socket.IO only tells connected, authorised clients that something has already happened. Approving a post shows the order:

```
Editor clicks Approve
  → POST /api/v1/moderation/posts/:id/approve
    → authenticate → requirePermission('posts.approve') → validate
    → ModerationService.approve
        transaction { post.status = published; AuditLog.create(...) }   ← durable
    → after commit:
        realtime.toModerators('post:approved', …)   ← other editors' queues refresh
        NotificationService.notify(author, …)       ← saved, then emitted as
                                                       'notification:new' to user:<authorId>
  ← 200 { data: post }
```

If the author is offline, the notification is still in the database. Their client fetches it over REST the next time it connects. A client cannot approve anything by emitting a socket event: the server listens to `post:join` and `post:leave` only.

---

## Installation

Prerequisites: Node.js 20 or newer, and MongoDB 6 or newer. A replica set (Atlas, or a local single-node replica set) is recommended so moderation transitions run in transactions; see [Audit log](#audit-log).

```bash
cd backend && npm install && cp .env.example .env     # edit .env
cd ../frontend && npm install
```

Run in development:

```bash
cd backend && npm run dev       # API and Socket.IO on http://localhost:5000
cd frontend && npm run dev      # http://localhost:5173 (proxies /api and /socket.io)
```

If the API runs on another port, start Vite with `API_PROXY_TARGET=http://localhost:<port> npm run dev` and set the backend's `CLIENT_URL` to the Vite origin.

---

## Environment

`backend/.env` (see `backend/.env.example`):

| Variable | Purpose |
| --- | --- |
| `NODE_ENV`, `PORT` | Runtime mode and port |
| `MONGODB_URI` | MongoDB connection string |
| `CLIENT_URL` | Allowed browser origin(s), comma-separated. Used for CORS on REST and Socket.IO, for the CSRF origin check, and as the OAuth return target (the first entry). |
| `API_URL` | Public API URL, used for the OAuth callback defaults |
| `TRUST_PROXY` | Number of trusted proxy hops (affects `req.ip`, rate limits and audit IPs) |
| `COOKIE_SAMESITE` | `lax` by default; `none` only when client and API are on different sites |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Distinct random secrets of at least 32 characters |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | `15m` and `7d` by default |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cover uploads; without them uploads return 503 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Google sign-in. Callback defaults to `${API_URL}/api/v1/auth/google/callback`. |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_CALLBACK_URL` | Facebook sign-in. Callback defaults to `${API_URL}/api/v1/auth/facebook/callback`. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Read only by `npm run seed:admin` |

The configuration is validated at startup. In production the API refuses to start without `MONGODB_URI`, `CLIENT_URL` or `API_URL`, or with the development JWT secrets.

`frontend/.env` (production builds only): `VITE_API_URL` and `VITE_SOCKET_URL`.

**OAuth setup:**

- **Google:** create a *Web application* OAuth client and add the redirect URI `http://localhost:5000/api/v1/auth/google/callback`.
- **Facebook:** add Facebook Login with the same path ending in `/facebook/callback`, and allow the `email` permission.
- The API checks a random `state` stored in an HttpOnly cookie. It links an existing account by email only if the provider has verified that email, and it never puts tokens in URLs.

**Cloudinary:** copy the cloud name, API key and API secret into `.env`. Covers are stored under `margin/covers`, and the secret never leaves the server.

---

## Database, admin seed and demo accounts

Indexes are synchronised on startup (`syncIndexes`; indexes that are no longer declared are dropped).

```bash
cd backend
npm run seed:categories          # Web Development, Frontend Engineering, Backend Engineering,
                                 # DevOps, AI and Machine Learning, Career and Tutorials
ADMIN_EMAIL=admin@margin.local ADMIN_PASSWORD='local-admin-passphrase' ADMIN_NAME='Local Admin' npm run seed:admin
npm run migrate:posts            # only for databases from earlier versions
```

There is no public admin sign-up. The seed reads credentials from the environment, requires a password of at least 12 characters, and never prints it. Running it again for the same email resets the password and re-activates the account as an admin.

**Local demo setup.** These are example credentials to create yourself; nothing is pre-configured.

1. Seed categories and an admin as shown above.
2. Sign in as the admin. Under **Staff & permissions**, create *Rita Reviewer* (`rita@margin.local`, any password of at least 12 characters) with **Review queue** only.
3. In a private window, **Join Margin** as a writer, write an article, choose a category and click **Submit for review**.
4. The admin's review queue and bell update live. Open the submission and click **Request changes** with a reason. The writer's bell updates live, and the dashboard shows the feedback.
5. Sign in as Rita. She sees only **Review queue** and has no approve button. Calling the approve endpoint directly returns `403`.
6. The writer resubmits and the admin approves; the article is now public.
7. A second reader likes and comments. The writer is notified live, and other readers on the page see the comment appear.
8. The writer edits the live article and clicks **Submit changes**. Readers keep seeing the old version until the admin approves the edit.
9. The admin grants Rita **Approve posts**, then opens the **Audit log** to see every step, with actor, previous and new state, and the reason.

---

## Roles and permissions

| Capability | Admin | Staff | User |
| --- | :-: | :-: | :-: |
| Write, save drafts and submit own posts | ✓ | ✓ (own) | ✓ (own) |
| Edit, archive or delete own posts | ✓ | ✓ (own) | ✓ (own) |
| View the moderation queue and submissions | ✓ | `posts.review` | own submissions only |
| Approve submissions or edits | ✓ | `posts.approve` (not own posts) | ✗ |
| Reject with a reason | ✓ | `posts.reject` (not own posts) | ✗ |
| Moderate any comment | ✓ | `comments.moderate` | own comments only |
| Manage categories and tags | ✓ | `categories.manage` | ✗ |
| Read the audit log | ✓ | `audit_logs.view` (explicit grant only) | ✗ |
| Users, staff, roles, permissions, account status | ✓ | ✗ | ✗ |
| See all posts and restore deleted ones | ✓ | ✗ | ✗ |
| Manage another user's post | ✓ | ✗ (moderation actions only) | ✗ |
| Like, bookmark and comment | ✓ | ✓ | ✓ |

How the rules are applied:

- **Grants:** staff start with no permissions. `posts.approve` and `posts.reject` require `posts.review`, and the API rejects permission sets that break this.
- **Who can change what:**
  - Staff cannot change their own role or permissions, create administrators, or review their own articles. Admins may review their own.
  - The last active admin cannot be demoted or deactivated.
  - Leaving the staff role clears all permissions (a model-level rule).
- **Effect of changes:** role and permission changes and deactivation are audited and notified. They also force the user's sockets to reconnect, so room membership is recalculated straight away.
- **Ownership** is checked separately from permissions: a staff member with moderation rights still cannot edit someone else's article.

---

## Publishing workflow

| From | Action | To | Who |
| --- | --- | --- | --- |
| — | create | `draft` | any user |
| `draft`, `rejected` | `POST /posts/:id/submit` | `pending_review` | author or admin; content and category required |
| `pending_review` | approve | `published` | admin, or staff with `posts.approve` |
| `pending_review` | reject (reason of 10–1000 characters) | `rejected` | admin, or staff with `posts.reject` |
| `pending_review`, `rejected` | author edits | `draft` | (withdraws the submission) |
| `published` | author edits | `published` + `revision: draft` | the live version is unchanged |
| `published` + revision | submit | `revision: pending_review` | |
| `published` + revision | approve | the revision is applied to the live post | `publishedAt` and the slug are unchanged |
| `published` + revision | reject | `revision: rejected` (with reason) | the live version stays public |
| `published` | `POST /posts/:id/archive` | `archived` | author or admin |
| `archived` | `POST /posts/:id/unarchive` | `draft` | must be reviewed again |
| any | `DELETE /posts/:id` | soft-deleted | author or admin; an admin can restore it |

Details:

- **Stored with each decision:** `submittedAt`, `reviewedAt`, `reviewedBy`, `rejectionReason` and `publishedAt`. `publishedAt` is set on first approval only.
- **Slugs** follow the title until first publication, then stay fixed.
- **Protected fields:** `status`, `slug`, `author`, `reviewedBy`, `publishedAt`, `likeCount`, `role` and `permissions` are never accepted from clients. Request bodies are validated with strict Zod schemas.
- **Public endpoints** (listing, search, tag, category and author queries, single posts, comments, likes, bookmarks and socket post rooms) only ever expose published, non-deleted posts, and never the revision or review fields.

---

## Audit log

`AuditLog` records contain `actor`, `actorRole`, `action`, `resourceType`, `resourceId`, `previousState`, `newState`, `reason`, `requestId`, `ip`, `userAgent` and `createdAt`.

- **What is logged:**
  - Every workflow transition: submit, approve, reject, archive, unarchive, delete, restore.
  - Staff creation, role changes, permission grants and revocations, activation and deactivation.
  - Category and tag changes, and comment moderation.
  - Sign-ins and registrations.
- **What is never logged:** request bodies, passwords or tokens.
- **Immutable.** There is no update or delete endpoint, and Mongoose hooks reject updates and deletes on the collection.
- **Written server-side** from the authenticated identity. The `X-Request-Id` (or a generated UUID) ties each entry to its request.
- **Consistent.** A status change and its audit record are written in one MongoDB transaction when the deployment supports it (replica set or Atlas). On a standalone server the post is saved with optimistic concurrency, and it is restored from a snapshot if the audit write fails. Both paths are exercised: the test suite uses a replica set, and the browser walkthrough ran against a standalone server.
- **Concurrent decisions:** if two editors decide at the same moment, one gets `409 Conflict`.
- **Who can read it:** admins, and staff explicitly granted `audit_logs.view`. Reviewers see the moderation history of the posts they review, but not the full log.

---

## Notifications and Socket.IO

**Notification rules.** Users are never notified about their own actions.

| Event | Recipients |
| --- | --- |
| Post or edit submitted | Active admins, and active staff with `posts.review` |
| Approved | Author |
| Rejected (includes the reason) | Author |
| Like | Author, once per liker (re-liking does not notify again) |
| Comment | Author |
| Permissions changed, role changed, staff account status changed | That user |

Notifications are saved first and then emitted. `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read` and `PATCH /notifications/read-all` are always scoped to the signed-in user.

**Socket server** (`backend/src/socket`):

- **Authentication:** the handshake requires the same JWT access token as REST (`auth: { token }`). Role, permissions and status are loaded from the database. Missing, forged or expired tokens and deactivated accounts are rejected.
- **Rooms:** joined only by the server.
  - `user:<id>` for private events.
  - `moderation` for admins and staff with `posts.review`.
  - `admin` for administrators.
  - `post:<id>`, joined through `post:join` only after the server checks that the post is published and not deleted.
- **When connections are cut:**
  - Each connection is dropped when its access token expires, and the client refreshes and reconnects.
  - Deactivation, role changes and permission changes disconnect the user's sockets immediately.
  - Archiving or deleting a post empties its room.
- **CORS** uses the same explicit origin list as REST.

**Events** (server to client):

| Event | Room | Payload |
| --- | --- | --- |
| `notification:new` | `user:<id>` | the saved notification |
| `notification:read` | `user:<id>` | `{ ids }` or `{ all: true }` (keeps other tabs in sync) |
| `post:submitted` | `moderation` | `{ postId, title, kind }` |
| `post:approved`, `post:rejected` | `moderation` and `user:<author>` | `{ postId, slug, title, kind, reason? }` |
| `comment:created`, `comment:updated` | `post:<id>` | `{ postId, comment }` (public author fields only) |
| `comment:deleted` | `post:<id>` | `{ postId, commentId }` |
| `activity:new` | `admin` | the new audit entry |

The only client-to-server events are `post:join { postId }` (acknowledged with `{ ok, error? }`) and `post:leave { postId }`.

**Client reliability** (`RealtimeContext`):

- One socket per signed-in user. Its handshake token is read fresh on every reconnect.
- On every connect the client re-reads the notifications and unread count over REST, so missed events reappear.
- Notifications and comments are de-duplicated by `_id`, and listeners are removed on unmount and logout.
- After a server-initiated disconnect the client refreshes its session, which also reloads role and permissions, before reconnecting.

---

## API reference

All routes are under `/api/v1`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET`/`PATCH /auth/me`, `GET /auth/{google,facebook}`, `GET /auth/{google,facebook}/callback` |
| Posts (public) | `GET /posts?page&limit&search&category&tag&author`, `GET /posts/:slug` |
| Posts (author) | `GET /posts/mine?status`, `POST /posts`, `PATCH /posts/:id`, `DELETE /posts/:id`, `POST /posts/:id/{submit,archive,unarchive}`, `DELETE /posts/:id/revision`, `PUT`/`DELETE /posts/:id/cover` |
| Engagement | `PUT`/`DELETE /posts/:id/like`, `PUT`/`DELETE /posts/:id/bookmark`, `GET /posts/saved` |
| Comments | `GET`/`POST /posts/:postId/comments`, `PATCH /comments/:id` (author), `DELETE /comments/:id` (author or `comments.moderate`) |
| Taxonomy | `GET /categories`, `POST`/`PATCH`/`DELETE /categories/:id`, `GET /tags`, `PATCH`/`DELETE /tags/:tag` (writes need `categories.manage`) |
| Authors | `GET /authors/:id` (public profile only) |
| Notifications | `GET /notifications?page&unread`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` |
| Moderation | `GET /moderation/posts?status=pending_review\|rejected`, `GET /moderation/posts/:id` (`posts.review`), `POST /moderation/posts/:id/approve` (`posts.approve`), `POST /moderation/posts/:id/reject` (`posts.reject`), `GET /moderation/comments` (`comments.moderate`) |
| Admin | `GET /admin/dashboard`, `GET /admin/users`, `GET /admin/users/:id`, `PATCH /admin/users/:id/role`, `PATCH /admin/users/:id/status`, `PUT /admin/users/:id/permissions`, `POST /admin/staff`, `GET /admin/posts?status`, `PATCH /admin/posts/:id/restore` (admin only); `GET /admin/audit-logs` (admin or `audit_logs.view`) |

Status codes:

| Code | Meaning |
| --- | --- |
| 400 | Validation error |
| 401 | Not authenticated |
| 403 | Forbidden or missing permission |
| 404 | Not found, including private posts, so their existence isn't revealed |
| 409 | Conflict: an invalid transition, a concurrent edit, the last admin, or a category still in use |
| 413 / 415 | Upload too large / unsupported type |
| 429 | Rate limited |
| 502 / 503 | The image upload failed / is not configured |

---

## Testing

```bash
cd backend
npm test            # Jest + Supertest + socket.io-client, in-memory MongoDB replica set
npm run typecheck
cd ../frontend
npm run typecheck && npm run lint && npm run build
```

The first run downloads a MongoDB binary. Cloudinary is mocked, OAuth providers are not contacted, and no real credentials are needed.

There are 161 tests in 11 suites:

| Suite | Covers |
| --- | --- |
| `auth` | Registration (never admin), hashing, tokens, refresh rotation and reuse detection, logout, rate limits, the OAuth state check and account linking |
| `moderation` | Queue access by permission; approving without `posts.approve` refused (the UI cannot be bypassed); revoked permissions enforced immediately; no self-review for staff; approve and reject records and reasons; revision approval; simultaneous decisions (one 409); rollback when the audit write fails; moderator notifications; history; audit immutability and access |
| `posts` | Drafting, mass-assignment protection, slugs, sanitising, submission rules, edit and revision policy, archive, ownership (staff cannot edit others' posts), public visibility in every query, filters, pagination, restore, cover images |
| `engagement` | Like deduplication (including concurrent requests), the self-like rule, likes on unpublished posts refused, bookmarks, notification recipients, read state, and isolation from other users |
| `comments` | Visibility, validation, ownership, staff moderation with audit, the moderation listing |
| `taxonomy` | Category permissions, duplicates, delete protection, tag rename/merge and delete |
| `admin` | Admin-only access, staff creation, permission grant/revoke audit and notifications, dependency validation, dashboard counts, deactivation, last-admin protection |
| `socket` | Unauthenticated, forged and expired connections refused; disconnect on token expiry; private events only to their recipient; REST recovery after missed events; a single delivery after reconnects; moderation room restricted; asking for a room does nothing; privileged socket events have no effect; the room is dropped when `posts.review` is revoked; post rooms; drafts refused |
| `jwt`, `slug`, `content` | Utilities |

---

## Deployment

- Serve `frontend/dist` from a static host with SPA fallback to `index.html`. Set `VITE_API_URL` and `VITE_SOCKET_URL` at build time.
- Run the API with `NODE_ENV=production` and real secrets. Use a replica set (Atlas works) so moderation transitions are transactional.
- Same-site deployments keep `COOKIE_SAMESITE=lax`. Cross-site deployments use `none` plus an exact `CLIENT_URL`.
- Behind a proxy, set `TRUST_PROXY`. The proxy must forward WebSocket upgrades on `/socket.io`.
- **Scaling:** rate limits and Socket.IO rooms live in process memory. A single API instance needs nothing more. Running several instances requires sticky sessions plus the Socket.IO Redis adapter and a shared rate-limit store; these are not included because the current deployment target is a single instance.

---

## Known limitations

- Google, Facebook and Cloudinary need real credentials. Their failure, state and validation paths are tested; their success paths were not exercised against the live services.
- Live updates require a signed-in reader, because sockets are authenticated. Anonymous readers see new comments on reload.
- Logging out ends the session's refresh token. That device's open socket closes on logout in the browser, or at the latest when its 15-minute access token expires.
- Comments are flat (no replies), so reply notifications are not implemented. Post reporting is not implemented.
- The last-admin check is not transactional. Two admins demoting each other at the same instant could, in theory, both succeed.
- Search uses MongoDB text search, which matches whole words, not prefixes.
