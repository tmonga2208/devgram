# Devgram

Devgram is a developer-focused social app inspired by Instagram. Developers share screenshots, videos and code snippets, follow each other, comment and message.

Live at **https://devgram-nine.vercel.app**.

## Features

- Feed of image, video and syntax-highlighted code posts
- Like, comment and save posts; saves are private to each user
- User profiles with avatar, bio and website
- Follow and unfollow
- Direct messages
- Notifications for likes, comments, follows, messages and @mentions
- Search across users and posts
- Explore grid and similar-post suggestions
- Account, notification and privacy settings
- Email and password authentication
- Installable as an app (PWA), with an offline page
- Phone layout with a bottom tab bar, back navigation and safe-area support

## Tech stack

- Next.js 15 (App Router) with API route handlers
- React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- MongoDB with Mongoose
- JWT authentication with `jose`; passwords hashed with `bcryptjs`

## Getting started

```bash
git clone https://github.com/tmonga2208/devgram.git
cd devgram
npm install
```

Create `.env.local` in the project root:

```bash
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=a_long_random_string
```

`JWT_SECRET` signs login tokens. Generate one with `openssl rand -hex 32`.

Name a database in the URI (for example `...mongodb.net/devgram_dev`). Without one MongoDB uses its default `test` database, and local accounts and test runs end up next to whatever else lives there. Use a different database for local work than the deployed app uses.

Run the development server:

```bash
npm run dev
```

Open http://localhost:3000 and register an account.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | start the dev server |
| `npm run build` | production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm run smoke` | end-to-end API test against the running dev server |
| `npm run mobile-check` | layout check of every page at phone width, in headless Chrome |

`npm run smoke` registers two `smoke_...` users through the API, exercises every endpoint, and then deletes everything those users created, straight from the database in `.env.local`. `npm run mobile-check` does the same with two `mobile_...` users and measures each page at 390px and 320px wide: no sideways scrolling, page margins, the tab bar, the back arrow, the messages screens, tab rows, long names and links, and safe areas. It needs Chrome or Chromium installed (`CHROME_PATH` points at another binary), and `MOBILE_SHOTS=some/dir` saves a screenshot of each page.

Both target `http://localhost:3000`. To test another server, set `SMOKE_BASE_URL`, and set `SMOKE_DB` when that server uses a different database from `.env.local`, so cleanup finds the test users:

```bash
SMOKE_BASE_URL=http://localhost:3001 npm run smoke
SMOKE_BASE_URL=https://devgram-nine.vercel.app SMOKE_DB=<production database> npm run smoke
```

Both refuse to start when the target's newest post is missing from the database cleanup would use.

## Installable app (PWA)

DevGram can be installed from the browser: "Install" in Chrome and Edge, "Add to Home Screen" on iOS and Android.

- `app/manifest.ts` describes the app. The icons are in `public/icons/` and `app/apple-icon.png`.
- `public/sw.js` is the service worker. It is registered in production builds only, so `npm run dev` never runs behind a cache. It caches build assets and icons, and shows `/offline` when a page cannot be loaded. It never caches API responses.
- The PNG icons are rendered from `app/icon.svg` and `public/icons/icon-maskable.svg`. To change the logo, edit those two files and render them again, for example `rsvg-convert -w 512 -h 512 app/icon.svg -o public/icons/icon-512.png`.

## Folder structure

```
devgram/
├── app/           # Pages and API route handlers (app/api)
├── components/    # Feature components and shadcn/ui primitives (components/ui)
├── contexts/      # Auth and posts React contexts
├── lib/           # Auth, database connection and server helpers
├── models/        # Mongoose models
├── public/        # Static files, app icons and the service worker
├── scripts/       # Smoke test and phone layout check
└── middleware.ts  # Redirects signed-out visitors away from protected pages
```

## API overview

Routes marked with a lock need an `Authorization: Bearer <token>` header.

```
POST   /api/auth/register            Register, returns a token
POST   /api/auth/login               Log in, returns a token

GET    /api/posts                    All posts, newest first
POST   /api/posts                 🔒 Create a post
GET    /api/posts/:id                One post
DELETE /api/posts/:id             🔒 Delete your post
POST   /api/posts/:id/like        🔒 Toggle like
POST   /api/posts/:id/save        🔒 Toggle save
GET    /api/posts/:id/comments       Comments on a post
POST   /api/posts/:id/comments    🔒 Add a comment
GET    /api/posts/similar/:id        Similar posts

GET    /api/users/:username          Public profile
POST   /api/users/:username/follow 🔒 Toggle follow
GET    /api/users/profile         🔒 Your account and settings
PATCH  /api/users/profile         🔒 Update profile, email, password, settings

GET    /api/messages              🔒 Your conversations
POST   /api/messages              🔒 Send a message
GET    /api/messages/:username    🔒 Messages with a user

GET    /api/notifications         🔒 Your notifications
PATCH  /api/notifications         🔒 Mark notifications read

GET    /api/search?q=&type=          Search users and posts
GET    /api/health                   Database connectivity check
```

## Not yet built

- Image and avatar upload (posts and avatars take a URL today)
- Tags and tag-based explore
- Skills and GitHub link on profiles
- Admin dashboard for moderation and analytics
- Enforcing privacy and notification preferences (they are saved, not applied)
- Push notifications and posting while offline

## License

MIT © tmonga2208
