# Devgram completion: make the existing features work

Date: 2026-10-13
Status: awaiting review

## Goal

Devgram's UI and API routes are mostly written, but the app does not build and
several features fail at runtime. This work makes every feature that already
has code work end to end. It adds no new features.

Success means:

- `tsc --noEmit`, `next lint` and `next build` pass.
- A smoke script exercises every API endpoint against a running dev server and
  a real MongoDB, and passes.
- The main flows work in the browser: register, log in, create a post, like,
  save, comment, follow, message, read notifications, search, edit profile and
  settings, log out.

## Out of scope

These are described in the README but have no code. They are not built here:

- Image or avatar upload (posts and avatars keep taking a URL).
- Tags and tag-based explore.
- Skills and GitHub link on profiles.
- Admin dashboard.
- Enforcing privacy and notification settings. They are saved and reloaded,
  but a private account still shows its posts and notification preferences do
  not suppress notifications.
- Real two-factor authentication.

## Current problems

### Build

- `components/search-results.tsx` imports `@/lib/mock-data`, which does not exist.
- `app/api/follow/route.ts` imports `authOptions` from `lib/auth.ts`, which does
  not export it. `components/FollowButton.tsx` uses a `next-auth` session that
  is never configured.
- Route handlers and dynamic pages type `params` as a plain object. Next 15
  passes a Promise.

### Auth

Three mechanisms verify one token:

| Mechanism | Where | Result |
| --- | --- | --- |
| `jsonwebtoken` in `middleware/auth.ts` | login, register, posts, like, delete, user GET/PATCH | works |
| `jose` in `lib/auth.ts` | messages, search, follow, notifications | works, except notifications, which misreads the return value and always answers 401 |
| `next-auth` `getToken` | comments POST, `PATCH /api/users/profile` | never configured, always 401 |

`middleware/auth.ts` also falls back to the secret `'your-secret-key'` when
`JWT_SECRET` is unset.

### Features

- Save: the client calls `POST /api/posts/[id]/save`, which does not exist.
  `Post.saved` is one boolean per post, shared by all users.
- Search queries `content` and `comments.content`; the fields are `caption` and
  `comments.text`. User input goes into `new RegExp` unescaped.
- Similar posts queries `content`, which does not exist, and uses the caption
  as an unescaped regex.
- The comments route compares `post.author` (an object) with a username, and
  passes the object as a notification recipient.
- `middleware.ts` protects `/messages`, `/create-post`, `/edit-profile` and
  redirects from `/signup`. The real routes are `/direct`, `/create`,
  `/edit-page` and `/register`.
- Settings forms toast through `sonner`, but only the `react-hot-toast`
  `Toaster` is mounted, so those toasts never appear.
- `privacy-settings.tsx` sends `privateAccount`, `allowMessages`,
  `postVisibility` and `storyVisibility`; the model has `isPrivate`,
  `allowMessaging`, `showPosts` and `showStories`. Settings forms start from
  hard-coded defaults instead of the saved values.
- The navbar Create and Notifications icons, the profile settings gear and the
  avatar camera button have no behaviour.
- `/placeholder.svg` is referenced throughout and is not in `public/`.
- `next/image` is used for user-supplied URLs, which fails for any host not
  listed in `next.config.ts`.

### Duplicates

- `/login` and `/auth/login`; `/register` and `/auth/signup`.
- `lib/mongodb.ts` and `lib/db.ts`.
- `User.following` (used by the profile page) and the `Follow` model with
  `/api/follow` (used only by the unused `FollowButton`).
- `create-post-form.tsx` (used) and `new-post-form.tsx` (unused).
- `app/settings/page.tsx` (used) and `components/settings-page.tsx` (unused).
- `createNotification` is copied into four route files.
- Two like handlers in `app/api/posts/[id]/route.ts` duplicate
  `app/api/posts/[id]/like/route.ts`.

## Design

### Auth

`lib/auth.ts` becomes the only auth module, built on `jose`:

- `signToken(user)` returns a 7-day JWT carrying `id`, `username`, `email`.
- `getAuthUser(req)` reads the Bearer token and returns
  `{ id, username, email } | null`. It never throws.
- `requireAuth(req)` returns either the user or a 401 `NextResponse`, so a
  route can write `const auth = await requireAuth(req); if (auth instanceof NextResponse) return auth`.
- A missing `JWT_SECRET` throws at first use. There is no fallback secret.

The avatar is no longer read from the token, because it goes stale when the
user changes it. Routes that need the avatar load it from the `User` document.

`middleware/auth.ts` is deleted. `jsonwebtoken`, `@types/jsonwebtoken` and
`next-auth` are removed from `package.json`.

The client keeps its current transport: the token lives in localStorage, is
sent as a Bearer header, and is mirrored to a cookie that `middleware.ts`
checks for page protection.

### Data model

- `Post.saved: boolean` is replaced by `savedBy: string[]` (usernames),
  mirroring `likedBy`. The client derives "saved" from
  `savedBy.includes(currentUsername)`.
- `Post.author` stays an embedded `{ username, avatar }`. Calls to
  `.populate('author')` are removed, since `author` is not a reference.
- `models/Follow.ts` is deleted. Following stays on `User.following`,
  `User.followingCount` and `User.followers`.
- `User.twoFactorEnabled` is left in the schema but no longer exposed.
- No migration is needed. Existing posts without `savedBy` read as an empty
  array.

### API

One connector, `lib/mongodb.ts`; `lib/db.ts` is deleted. One
`lib/notifications.ts` exporting `createNotification`. One `lib/regex.ts`
exporting `escapeRegex`.

| Route | Change |
| --- | --- |
| `POST /api/auth/login`, `register` | use `signToken`; validate required fields; return 400 with the validation message instead of a generic 500 |
| `GET /api/posts` | drop `populate` |
| `POST /api/posts` | use `requireAuth`; take the avatar from the `User` document; remove the `"hi"` fallback |
| `GET/DELETE /api/posts/[id]` | async `params`; return 404 for a malformed id. The `PATCH` and `POST` handlers are deleted |
| `POST /api/posts/[id]/like` | atomic `$addToSet` / `$pull` with `likes` kept equal to `likedBy.length` |
| `POST /api/posts/[id]/save` | new; toggles the username in `savedBy` atomically |
| `POST /api/posts/[id]/comments` | use `requireAuth`; fix the author comparison; return the stored comment including `_id` |
| `GET /api/posts/similar/[id]` | match on `language`, falling back to the same author; no regex on user text |
| `GET /api/search` | public, like the feed and profiles it links to; search `caption`, `author.username`, `comments.text` with escaped input |
| `GET /api/users/[username]` | async `params`; use `getAuthUser` for `isFollowing` |
| `PATCH /api/users/[username]` | deleted; its only caller is the unused settings page |
| `PATCH /api/users/profile` | use `requireAuth`; accept `fullName`, `bio`, `website`, `avatar`, `email` (unique), password change, `notificationSettings`, `privacySettings`; reject `username`; allow clearing `bio` and `website` |
| `GET /api/users/profile` | new; returns the signed-in user with settings, so the settings forms can load saved values |
| `POST /api/users/[username]/follow` | atomic updates; reject following yourself |
| `GET/PATCH /api/notifications` | use `requireAuth` |
| `GET/POST /api/messages`, `GET /api/messages/[username]` | use `requireAuth`; async `params`; reject a receiver that does not exist |
| `/api/follow` | deleted |

All handlers respond with JSON errors of the form `{ error: string }`.

### Pages and components

- `/login` and `/register` are the only auth pages. `app/auth/`,
  `login-form.tsx` and `signup-form.tsx` are deleted.
- `/edit-page` is deleted. Profile editing lives in the Settings "Profile" tab.
- Deleted as unused: `FollowButton.tsx`, `new-post-form.tsx`,
  `settings-page.tsx`, `search-results.tsx`, `components/ui/sidebar.tsx`,
  `hooks/use-mobile.ts`.
- `middleware.ts` protects `/settings`, `/direct`, `/notifications`, `/create`
  and `/profile`, and redirects signed-in users away from `/login` and
  `/register`.
- Dynamic pages (`/p/[id]`, `/profile/[username]`) await `params`.
- Navbar: Create links to `/create`, Notifications to `/notifications`.
  Profile gear links to `/settings`.
- `edit-profile-form.tsx`: username shown read-only, an avatar URL field
  replaces the camera button, and the save button submits the form.
- `account-settings.tsx`: the 2FA switch is removed.
- `privacy-settings.tsx` and `notification-settings.tsx`: field names match the
  model and initial values come from `GET /api/users/profile`.
- Settings components switch to `react-hot-toast`; `sonner` is removed.
- `auth-context`: `updateProfile` accepts the settings and password fields it
  is already called with, and merges the response into the stored user.
- `posts-context`: `savePost` sends the auth header and updates `savedBy`;
  `likePost` uses the functional `setPosts` form.
- `post.tsx`, `post-detail.tsx`, `profile.tsx`: use `savedBy`; the Saved tab
  appears only on your own profile; signed-out users who like, save or comment
  are sent to `/login` instead of getting a failed request.
- User-supplied image and avatar URLs render with `<img>` rather than
  `next/image`. The `images.domains` list in `next.config.ts` is removed.
- `public/placeholder.svg` is added.

### Error handling

- API: 400 for invalid input, 401 unauthenticated, 403 not the owner, 404 not
  found, 409 for duplicate username or email, 500 otherwise.
- Client: failed mutations show a toast with the server's `error` message.
  A 401 on any authenticated call logs the user out and sends them to `/login`,
  which covers expired tokens.

## Verification

- `npm install`, then `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- `scripts/smoke.mjs` runs against the dev server using the `MONGODB_URI` in
  `.env.local`. It registers two users named `smoke_<random>`, then covers
  login, create post (image, code), list, like and unlike, save and unsave,
  comment, follow and unfollow, send and read a message, read and mark
  notifications, search, profile and settings update, password change, delete
  post, and the 401/403/404 cases. It then deletes the users, posts, messages
  and notifications it created, by connecting to MongoDB directly.
- Manual pass through the same flows in the browser.

## Documentation

`README.md` is rewritten to match the code: Next.js App Router with API routes,
MongoDB via Mongoose, custom JWT auth, the environment variables
`MONGODB_URI` and `JWT_SECRET`, the real folder layout, and the real feature
list. The unbuilt features move to a "Not yet built" section.
