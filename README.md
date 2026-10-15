# Devgram

Devgram is a developer-focused social app inspired by Instagram. Developers share screenshots, videos and code snippets, follow each other, comment and message.

Live at **https://devgram-nine.vercel.app**.

## Features

- Feed of photo, video and code posts; photos and videos upload from your device (or paste a link)
- Code posts with up to 5 files in 26 languages: line numbers, Copy, and Run for HTML and JavaScript in a locked-down sandbox; written in Monaco (VS Code's editor) on computers
- DevBits: short vertical videos (up to 90 seconds) in a full-screen swipe feed, on their own tab and on profiles
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
- Vercel Blob for photos, Mux for videos
- Prism for code highlighting; Monaco (`@monaco-editor/react`) for writing code on computers

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
BLOB_READ_WRITE_TOKEN=from_vercel_blob
MUX_TOKEN_ID=from_mux
MUX_TOKEN_SECRET=from_mux
MUX_TEST_UPLOADS=1
```

`JWT_SECRET` signs login tokens. Generate one with `openssl rand -hex 32`. `MUX_TEST_UPLOADS=1` is for local work only: Mux then makes free test videos (watermarked, cut to 10 seconds, deleted after a day).

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
| `npm run test:unit` | unit tests for the upload rules, code posts (file rules, highlighting, Run) and photo and video deletes |
| `npm run smoke` | end-to-end API test against the running dev server |
| `npm run mobile-check` | layout check of every page at phone width, in headless Chrome |

`npm run smoke` registers two `smoke_...` users through the API, exercises every endpoint, and then deletes everything those users created, straight from the database in `.env.local`. `npm run mobile-check` does the same with two `mobile_...` users and measures each page at 390px and 320px wide: no sideways scrolling, page margins, the tab bar, the back arrow, the messages screens, tab rows, long names and links, code posts (tabs, Copy, Run and its 5-second stop, writing them on a phone), and safe areas; at desktop size it checks that Monaco loads and that the plain box takes over when it can't. It needs Chrome or Chromium installed (`CHROME_PATH` points at another binary), and `MOBILE_SHOTS=some/dir` saves a screenshot of each page.

Both target `http://localhost:3000`. To test another server, set `SMOKE_BASE_URL`, and set `SMOKE_DB` when that server uses a different database from `.env.local`, so cleanup finds the test users:

```bash
SMOKE_BASE_URL=http://localhost:3001 npm run smoke
SMOKE_BASE_URL=https://devgram-nine.vercel.app SMOKE_DB=<production database> npm run smoke
```

Both refuse to start when the target's newest post is missing from the database cleanup would use.

The smoke test's photos, videos and devbits sections, and the phone check's upload and playback checks, upload real files and remove them through the Blob and Mux keys in `.env.local`. They skip themselves when those keys are missing; run them only against a server that uses the same Blob store and Mux account.

## Installable app (PWA)

DevGram can be installed from the browser: "Install" in Chrome and Edge, "Add to Home Screen" on iOS and Android.

- `app/manifest.ts` describes the app. The icons are in `public/icons/` and `app/apple-icon.png`.
- `public/sw.js` is the service worker. It is registered in production builds only, so `npm run dev` never runs behind a cache. It caches build assets and icons, and shows `/offline` when a page cannot be loaded. It never caches API responses.
- The PNG icons are rendered from `app/icon.svg` and `public/icons/icon-maskable.svg`. To change the logo, edit those two files and render them again, for example `rsvg-convert -w 512 -h 512 app/icon.svg -o public/icons/icon-512.png`.

## Photo and video uploads

Photos (post images and profile pictures) go to [Vercel Blob](https://vercel.com/docs/vercel-blob); videos go to [Mux](https://www.mux.com). The browser uploads straight to them with short-lived credentials from `/api/uploads/*`, so files never pass through a Vercel Function. A video post is created only once Mux has the video ready; pressing Post earlier shows "Processing video…" and posts it when it is.

Setup for a new deployment:

1. `vercel blob create-store devgram-media --access public --environment production --environment preview --yes`
2. `vercel blob create-store devgram-media-dev --access public --environment development --yes` (a separate store for local work). This also rewrites `.env.local` with the Development variables, so check your own values afterwards.
3. Accept Mux's terms in the Vercel dashboard (Integrations → Mux), then `vercel integration add mux --plan hobby --no-env-pull` (`hobby` is Mux's Free plan). This sets `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` for every environment.
4. On another machine, copy `BLOB_READ_WRITE_TOKEN`, `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` from `vercel env pull some-file --environment=development` into `.env.local`. Don't pull straight onto `.env.local`: that replaces the whole file.

Limits: photos up to 10 MB (JPEG, PNG, WebP, GIF), shrunk in the browser to 2048px when bigger than that or 2 MB; videos up to 2 minutes and 200 MB. A file Mux turns into sound without a picture counts as a failed video. Deleting a post deletes its uploaded photo or video, and changing your profile picture deletes the old upload.

## Code posts

A code post holds up to 5 files (`files: [{ name, language, code }]`), each up to 20,000 characters, in one of the 26 languages listed in `lib/code-files.ts`. A post's `language` is its first file's, which similar posts match on. Posts made before files keep `code` and `language` and show as one file, and `POST /api/posts` still accepts that form.

- **Writing:** computers (a mouse or trackpad, and a screen at least 768px wide) get Monaco, loaded from jsDelivr (`monaco-editor@0.55.1`). Phones get a plain box with a highlighted preview, and so does a computer where Monaco doesn't load within 10 seconds.
- **Run:** a post with an HTML file shows a live preview, with the post's CSS and JavaScript added. A JavaScript-only post shows its console output. The code runs in an iframe with `sandbox="allow-scripts"` and nothing else, so it can't reach Devgram's storage, cookies or sign-in. A JavaScript-only run happens in a worker inside that frame, which is removed after 5 seconds, so an endless loop can't freeze the page. A preview whose own script never stops can still freeze a browser that runs sandboxed frames in the page's own process.

## Folder structure

```
devgram/
├── app/           # Pages and API route handlers (app/api)
├── components/    # Feature components and shadcn/ui primitives (components/ui)
├── contexts/      # Auth and posts React contexts
├── hooks/         # Photo and video upload hooks for the forms
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
POST   /api/posts                 🔒 Create a post (files for code, kind "devbit" for a DevBit)
GET    /api/posts/:id                One post
DELETE /api/posts/:id             🔒 Delete your post
POST   /api/posts/:id/like        🔒 Toggle like
POST   /api/posts/:id/save        🔒 Toggle save
GET    /api/posts/:id/comments       Comments on a post
POST   /api/posts/:id/comments    🔒 Add a comment
GET    /api/posts/similar/:id        Similar posts
GET    /api/devbits                  DevBits, shuffled (?user= for one person's, newest first)

POST   /api/uploads/image         🔒 Token to upload one photo to Blob
POST   /api/uploads/video         🔒 One-time Mux address to upload a video to
GET    /api/uploads/video/:id     🔒 How far your video upload has got

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

- Tags and tag-based explore
- Skills and GitHub link on profiles
- Admin dashboard for moderation and analytics
- Enforcing privacy and notification preferences (they are saved, not applied)
- Push notifications and posting while offline

## License

MIT © tmonga2208
