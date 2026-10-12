# Devgram Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Devgram feature that already has code build and work end to end, without adding new features.

**Architecture:** One `jose`-based auth module replaces three competing mechanisms; every API route moves to it and to one DB connector. The client gets one `authFetch` that attaches the token and logs out on 401. Duplicate and dead files are deleted.

**Tech Stack:** Next.js 15.3 App Router, React 19, TypeScript, Mongoose 8, `jose`, Tailwind 4, shadcn/ui, `react-hot-toast`.

**Spec:** `docs/superpowers/specs/2026-10-13-devgram-completion-design.md`

## Global Constraints

- No new features. Out of scope: image upload, tags, skills/GitHub fields, admin dashboard, enforcing privacy or notification settings, real 2FA.
- Auth library is `jose` only. `jsonwebtoken`, `@types/jsonwebtoken`, `next-auth` and `sonner` are removed.
- `JWT_SECRET` is required. No fallback secret anywhere.
- The JWT carries `id`, `username`, `email` and expires in `7d`. It never carries the avatar.
- Usernames are immutable after registration and match `/^\w{3,30}$/`.
- Every API error is JSON `{ error: string }` with status 400, 401, 403, 404, 409 or 500.
- Route handlers and dynamic pages type `params` as a `Promise` and `await` it.
- User-supplied URLs (post image, post video, avatar, website) must be `http:` or `https:`.
- User-supplied images render with `<img>`, never `next/image`.
- Toasts use `react-hot-toast`.
- `.env.local` holds `MONGODB_URI` and `JWT_SECRET`. Never print or commit it.
- The smoke test only deletes documents belonging to the two `smoke_<run>_a` / `smoke_<run>_b` users it created.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Malformed JSON or wrong-typed fields in a request body** should get a 400 with a message, not a 500. Pinned in Task 2 (`auth` section, "malformed JSON") and Task 3 ("caption wrong type").
2. **A malformed id in a URL** (`/p/not-an-id`, `/api/posts/not-an-id`) should get a 404, not a Mongoose cast error. Pinned in Task 3 ("malformed id") and handled in the post page in Task 7.
3. **Regex metacharacters in a search query** (`(`, `.*`) should match literally and never 500. Pinned in Task 5 ("regex metacharacters").
4. **`javascript:` or other non-http URLs** in website, avatar, image or video should be rejected, since they are rendered as `href`/`src`. Pinned in Task 3 ("javascript: image url") and Task 4 ("javascript: website").
5. **Two like requests racing** (double click) should leave `likes === likedBy.length`. Pinned in Task 3 ("parallel likes stay consistent").

## How testing works in this plan

There is no test framework in the repo and the spec's verification is a smoke script against a running dev server and the real database. Each API task therefore follows this cycle:

1. Add the task's section to `scripts/smoke.mjs`.
2. Run that section and watch it fail.
3. Implement.
4. Run it again and watch it pass.

Keep `npm run dev` running in a background terminal for Tasks 1 to 9. Run a section with `npm run smoke -- <section>`; run everything with `npm run smoke`.

`npm run typecheck` is expected to report errors until the end of Task 8, because routes and components are migrated in stages. Each task says which files may still have errors. From Task 8 on it must be clean.

## File Structure

Created:

| File | Responsibility |
| --- | --- |
| `lib/http.ts` | `jsonError`, `readJson`, `isValidId`, `isHttpUrl`, `handleRouteError` |
| `lib/regex.ts` | `escapeRegex` |
| `lib/notifications.ts` | `createNotification`, `notifyMentions` |
| `lib/user-response.ts` | settings defaults and `toPrivateUser` serializer |
| `app/api/posts/[id]/save/route.ts` | toggle save |
| `scripts/smoke.mjs` | end-to-end API smoke test |
| `public/placeholder.svg` | default avatar |

Rewritten: `lib/auth.ts`, every file under `app/api/` except `health`, `contexts/auth-context.tsx`, `contexts/posts-context.tsx`, `components/post.tsx`, `components/post-detail.tsx`, `components/profile.tsx`, `components/edit-profile-form.tsx`, `components/account-settings.tsx`, `components/notification-settings.tsx`, `components/privacy-settings.tsx`, `README.md`.

Deleted: `middleware/auth.ts`, `lib/db.ts`, `models/Follow.ts`, `app/api/follow/`, `app/auth/`, `app/edit-page/`, `components/FollowButton.tsx`, `components/login-form.tsx`, `components/signup-form.tsx`, `components/new-post-form.tsx`, `components/settings-page.tsx`, `components/search-results.tsx`, `components/ui/sidebar.tsx`, `hooks/use-mobile.ts`.

---

### Task 1: Install, remove dead code, add the smoke harness

**Files:**
- Delete: the 14 paths listed under "Deleted" above, except `middleware/auth.ts` and `lib/db.ts` (those go in Task 5)
- Create: `scripts/smoke.mjs`, `public/placeholder.svg`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run typecheck`, `npm run smoke -- <section...>`. In `scripts/smoke.mjs`: `check(name, condition, detail?)`, `api(method, path, { token?, body?, raw? })` returning `{ status, data, text }`, `ensureUsers()` filling `state.a` and `state.b` with `{ token, user, password }`, `names.a`, `names.b`, and a `sections` object that later tasks add keys to.

- [ ] **Step 1: Install dependencies**

Run: `npm install`
Expected: completes without `ERR!` lines. `node_modules/` exists.

- [ ] **Step 2: Delete dead files**

```bash
git rm -r -q app/api/follow app/auth app/edit-page models/Follow.ts \
  components/FollowButton.tsx components/login-form.tsx components/signup-form.tsx \
  components/new-post-form.tsx components/settings-page.tsx components/search-results.tsx \
  components/ui/sidebar.tsx hooks/use-mobile.ts
```

Then confirm nothing still imports them:

Run: `grep -rnE "FollowButton|login-form|signup-form|new-post-form|settings-page|search-results|ui/sidebar|use-mobile|models/Follow|mock-data" app components contexts lib`
Expected: no output.

- [ ] **Step 3: Add the placeholder avatar**

Create `public/placeholder.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150" width="150" height="150">
  <rect width="150" height="150" fill="#e5e7eb"/>
  <circle cx="75" cy="58" r="26" fill="#9ca3af"/>
  <path d="M25 135c0-28 22-46 50-46s50 18 50 46z" fill="#9ca3af"/>
</svg>
```

- [ ] **Step 4: Add scripts to `package.json`**

In the `"scripts"` block, add two entries after `"lint"`:

```json
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "smoke": "node --env-file=.env.local scripts/smoke.mjs"
```

- [ ] **Step 5: Write the smoke harness**

Create `scripts/smoke.mjs`:

```js
// End-to-end API smoke test. Needs `npm run dev` running and MONGODB_URI in .env.local.
// Usage: npm run smoke            (all sections)
//        npm run smoke -- posts   (one or more named sections)
import mongoose from "mongoose"

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000"
const run = Math.random().toString(36).slice(2, 8)
export const names = { a: `smoke_${run}_a`, b: `smoke_${run}_b` }
const state = {}
let checks = 0
let failures = 0

function check(name, condition, detail = "") {
  checks++
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ""}`)
  }
}

async function api(method, path, { token, body, raw } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (raw !== undefined) {
    headers["Content-Type"] = "application/json"
    payload = raw
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json"
    payload = JSON.stringify(body)
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload })
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {}
  return { status: res.status, data, text }
}

async function ensureUsers() {
  if (state.a) return
  for (const key of ["a", "b"]) {
    const password = "smoke-pass-1"
    const res = await api("POST", "/api/auth/register", {
      body: {
        username: names[key],
        email: `${names[key]}@example.com`,
        password,
        fullName: `Smoke ${key.toUpperCase()}`,
      },
    })
    if (res.status !== 201) {
      throw new Error(`could not register ${names[key]}: ${res.status} ${res.text.slice(0, 200)}`)
    }
    state[key] = { token: res.data.token, user: res.data.user, password }
  }
}

const sections = {
  async health() {
    const res = await api("GET", "/api/health")
    check("health responds 200", res.status === 200, `status ${res.status}`)
    check("mongodb connected", res.data?.mongodb === "connected", res.text.slice(0, 200))
  },
}

async function cleanup() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection
  const list = Object.values(names)
  const removed = {
    posts: await db.collection("posts").deleteMany({ "author.username": { $in: list } }),
    messages: await db
      .collection("messages")
      .deleteMany({ $or: [{ sender: { $in: list } }, { receiver: { $in: list } }] }),
    notifications: await db
      .collection("notifications")
      .deleteMany({ $or: [{ sender: { $in: list } }, { recipient: { $in: list } }] }),
    users: await db.collection("users").deleteMany({ username: { $in: list } }),
  }
  await mongoose.disconnect()
  console.log(
    `cleanup: ${Object.entries(removed)
      .map(([k, v]) => `${k}=${v.deletedCount}`)
      .join(" ")}`,
  )
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Run through `npm run smoke`.")
    process.exit(2)
  }
  const wanted = process.argv.slice(2)
  const unknown = wanted.filter((name) => !sections[name])
  if (unknown.length) {
    console.error(`unknown section(s): ${unknown.join(", ")}. Known: ${Object.keys(sections).join(", ")}`)
    process.exit(2)
  }
  const toRun = wanted.length ? wanted : Object.keys(sections)
  try {
    for (const name of toRun) {
      console.log(`\n[${name}]`)
      try {
        await sections[name]()
      } catch (error) {
        failures++
        console.log(`  FAIL section threw -- ${error.message}`)
      }
    }
  } finally {
    await cleanup()
  }
  console.log(`\n${checks} checks, ${failures} failed`)
  process.exit(failures ? 1 : 0)
}

main()
```

- [ ] **Step 6: Start the dev server and run the health section**

Run (background terminal, leave running): `npm run dev`
Run: `npm run smoke -- health`
Expected:

```
[health]
  ok   health responds 200
  ok   mongodb connected
cleanup: posts=0 messages=0 notifications=0 users=0

2 checks, 0 failed
```

If "mongodb connected" fails, stop and report the `details` text: the database is unreachable (commonly an Atlas IP allowlist or a wrong password) and no later task can be verified.

- [ ] **Step 7: Record the typecheck baseline**

Run: `npm run typecheck 2>&1 | tail -5`
Expected: errors are reported (this is the starting point; nothing to fix yet).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Remove dead duplicates and add smoke test harness

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Auth core, shared server helpers, login and register

**Files:**
- Create: `lib/http.ts`, `lib/regex.ts`, `lib/notifications.ts`, `lib/user-response.ts`
- Rewrite: `lib/auth.ts`, `app/api/auth/login/route.ts`, `app/api/auth/register/route.ts`
- Modify: `lib/mongodb.ts:6`, `models/User.ts` (avatar default)
- Test: `scripts/smoke.mjs` (`auth` section)

**Interfaces:**
- Produces, from `lib/auth.ts`: `interface AuthUser { id: string; username: string; email: string }`, `signToken(user: AuthUser): Promise<string>`, `getAuthUser(req: Request): Promise<AuthUser | null>`, `requireAuth(req: Request): Promise<AuthUser | NextResponse>`.
- Produces, from `lib/http.ts`: `jsonError(message: string, status: number): NextResponse`, `readJson(req: Request): Promise<Record<string, unknown> | null>`, `isValidId(id: string): boolean`, `isHttpUrl(value: string): boolean`, `handleRouteError(error: unknown, label: string, fallback: string): NextResponse`.
- Produces, from `lib/regex.ts`: `escapeRegex(value: string): string`.
- Produces, from `lib/notifications.ts`: `createNotification(sender: string, recipient: string, type: NotificationType, content: string, postId?: string): Promise<void>` (no-op when sender equals recipient), `notifyMentions(sender: string, text: string, content: string, postId: string, exclude?: string[]): Promise<void>`.
- Produces, from `lib/user-response.ts`: `NOTIFICATION_DEFAULTS`, `PRIVACY_DEFAULTS`, `toPrivateUser(user: IUser)` returning `{ id, username, email, fullName, avatar, bio, website, notificationSettings, privacySettings }`.
- Note: after this task the old `authMiddleware` export is gone from `lib/auth.ts`, so `messages`, `search`, `notifications` and `users/[username]/follow` routes fail until Tasks 4 and 5 rewrite them. That is expected.

- [ ] **Step 1: Add the `auth` smoke section**

In `scripts/smoke.mjs`, add this method to the `sections` object after `health`:

```js
  async auth() {
    await ensureUsers()
    check("register returns a token", typeof state.a.token === "string" && state.a.token.length > 20)
    check("register returns the user", state.a.user?.username === names.a)
    check("register response has no password", !("password" in (state.a.user || {})))
    check("register response includes settings", state.a.user?.notificationSettings?.likes === true)

    const dup = await api("POST", "/api/auth/register", {
      body: { username: names.a, email: `other_${names.a}@example.com`, password: "smoke-pass-1", fullName: "Dup" },
    })
    check("duplicate username is 409", dup.status === 409, `status ${dup.status}`)

    const missing = await api("POST", "/api/auth/register", { body: { username: `${names.a}x` } })
    check("missing fields is 400", missing.status === 400, `status ${missing.status}`)

    const shortPw = await api("POST", "/api/auth/register", {
      body: { username: `${names.a}y`, email: `${names.a}y@example.com`, password: "123", fullName: "Short" },
    })
    check("short password is 400", shortPw.status === 400, `status ${shortPw.status}`)

    const badName = await api("POST", "/api/auth/register", {
      body: { username: "has space", email: `${names.a}z@example.com`, password: "smoke-pass-1", fullName: "Bad" },
    })
    check("invalid username is 400", badName.status === 400, `status ${badName.status}`)

    const malformed = await api("POST", "/api/auth/login", { raw: "{not json" })
    check("malformed JSON is 400", malformed.status === 400, `status ${malformed.status}`)

    const login = await api("POST", "/api/auth/login", {
      body: { email: `${names.a}@example.com`, password: state.a.password },
    })
    check("login is 200 with token", login.status === 200 && typeof login.data?.token === "string", `status ${login.status}`)
    check("login returns bio and website", login.data?.user?.bio === "" && login.data?.user?.website === "")

    const upper = await api("POST", "/api/auth/login", {
      body: { email: `${names.a}@EXAMPLE.com`.toUpperCase(), password: state.a.password },
    })
    check("login ignores email case", upper.status === 200, `status ${upper.status}`)

    const wrong = await api("POST", "/api/auth/login", {
      body: { email: `${names.a}@example.com`, password: "wrong-password" },
    })
    check("wrong password is 401", wrong.status === 401, `status ${wrong.status}`)

    const unknown = await api("POST", "/api/auth/login", {
      body: { email: `nobody_${run}@example.com`, password: "whatever1" },
    })
    check("unknown email is 401", unknown.status === 401, `status ${unknown.status}`)
  },
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run smoke -- auth`
Expected: `FAIL section threw -- could not register smoke_..._a: 200 ...` (register currently answers 200, the harness requires 201), 1 failed.

- [ ] **Step 3: Write `lib/http.ts`**

```ts
import { NextResponse } from "next/server"
import mongoose from "mongoose"

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

// Returns the parsed body when it is a JSON object, otherwise null.
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json()
    return body && typeof body === "object" && !Array.isArray(body) ? body : null
  } catch {
    return null
  }
}

export function isValidId(id: string) {
  return /^[a-f\d]{24}$/i.test(id)
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export function handleRouteError(error: unknown, label: string, fallback: string) {
  if (error instanceof mongoose.Error.ValidationError) {
    const first = Object.values(error.errors)[0]
    return jsonError(first?.message || "Invalid input", 400)
  }
  if (typeof error === "object" && error !== null && (error as { code?: number }).code === 11000) {
    return jsonError("That value is already taken", 409)
  }
  console.error(`${label}:`, error)
  return jsonError(fallback, 500)
}
```

- [ ] **Step 4: Write `lib/regex.ts`**

```ts
export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
```

- [ ] **Step 5: Rewrite `lib/auth.ts`**

```ts
import { NextResponse } from "next/server"
import { SignJWT, jwtVerify } from "jose"

export interface AuthUser {
  id: string
  username: string
  email: string
}

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("Please define the JWT_SECRET environment variable inside .env.local")
  }
  return new TextEncoder().encode(secret)
}

export async function signToken(user: AuthUser) {
  return new SignJWT({ id: user.id, username: user.username, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret())
}

// Returns null for a missing, malformed or expired token.
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const header = req.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) return null
  const token = header.slice(7).trim()
  if (!token) return null

  const secret = getSecret()
  try {
    const { payload } = await jwtVerify(token, secret)
    if (
      typeof payload.id !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.email !== "string"
    ) {
      return null
    }
    return { id: payload.id, username: payload.username, email: payload.email }
  } catch {
    return null
  }
}

export async function requireAuth(req: Request): Promise<AuthUser | NextResponse> {
  const user = await getAuthUser(req)
  return user ?? NextResponse.json({ error: "Authentication required" }, { status: 401 })
}
```

- [ ] **Step 6: Write `lib/user-response.ts`**

```ts
import type { IUser } from "@/models/User"

export const NOTIFICATION_DEFAULTS = {
  email: true,
  push: true,
  followers: true,
  comments: true,
  likes: true,
  mentions: true,
  marketing: false,
}

export const PRIVACY_DEFAULTS = {
  isPrivate: false,
  showActivityStatus: true,
  allowTagging: true,
  allowMessaging: true,
  showPosts: true,
  showStories: true,
}

export type NotificationKey = keyof typeof NOTIFICATION_DEFAULTS
export type PrivacyKey = keyof typeof PRIVACY_DEFAULTS

function pick<K extends string>(defaults: Record<K, boolean>, stored: Partial<Record<K, boolean>> | undefined) {
  const result = { ...defaults }
  for (const key of Object.keys(defaults) as K[]) {
    if (typeof stored?.[key] === "boolean") result[key] = stored[key] as boolean
  }
  return result
}

// The signed-in user's own view of their account. Never includes the password.
export function toPrivateUser(user: IUser) {
  return {
    id: String(user._id),
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    avatar: user.avatar || "/placeholder.svg",
    bio: user.bio || "",
    website: user.website || "",
    notificationSettings: pick(NOTIFICATION_DEFAULTS, user.notificationSettings),
    privacySettings: pick(PRIVACY_DEFAULTS, user.privacySettings),
  }
}
```

- [ ] **Step 7: Write `lib/notifications.ts`**

```ts
import Notification from "@/models/Notification"
import User from "@/models/User"

export type NotificationType = "like" | "comment" | "follow" | "message" | "mention"

export async function createNotification(
  sender: string,
  recipient: string,
  type: NotificationType,
  content: string,
  postId?: string,
) {
  if (sender === recipient) return
  await Notification.create({ sender, recipient, type, content, postId, read: false })
}

// Notifies each existing user @mentioned in text, except the sender and anyone in exclude.
export async function notifyMentions(
  sender: string,
  text: string,
  content: string,
  postId: string,
  exclude: string[] = [],
) {
  const mentioned = [...new Set((text.match(/@(\w+)/g) || []).map((match) => match.slice(1)))].filter(
    (username) => username !== sender && !exclude.includes(username),
  )
  if (mentioned.length === 0) return

  const users = await User.find({ username: { $in: mentioned } }).select("username").lean()
  for (const user of users as Array<{ username: string }>) {
    await createNotification(sender, user.username, "mention", content, postId)
  }
}
```

- [ ] **Step 8: Fix the connector message and the avatar default**

In `lib/mongodb.ts`, replace the error text:

```ts
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
```

In `models/User.ts`, replace the avatar default:

```ts
    avatar: {
      type: String,
      default: '/placeholder.svg',
    },
```

- [ ] **Step 9: Rewrite `app/api/auth/register/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import { signToken } from '@/lib/auth';
import { handleRouteError, jsonError, readJson } from '@/lib/http';
import { toPrivateUser } from '@/lib/user-response';

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    if (!body) return jsonError('Invalid request body', 400);

    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';

    if (!username || !email || !password || !fullName) {
      return jsonError('Username, email, password and full name are required', 400);
    }
    if (!/^\w{3,30}$/.test(username)) {
      return jsonError('Username must be 3-30 letters, numbers or underscores', 400);
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return jsonError('Please enter a valid email address', 400);
    }
    if (password.length < 6) {
      return jsonError('Password must be at least 6 characters long', 400);
    }

    await connectToDatabase();

    const existing = await User.findOne({ $or: [{ email }, { username }] }).select('username email').lean();
    if (existing) {
      const taken = (existing as { username: string }).username === username ? 'Username' : 'Email';
      return jsonError(`${taken} is already taken`, 409);
    }

    const user = await User.create({ username, email, password, fullName });
    const token = await signToken({ id: String(user._id), username: user.username, email: user.email });

    return NextResponse.json({ token, user: toPrivateUser(user) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Registration error', 'Registration failed');
  }
}
```

- [ ] **Step 10: Rewrite `app/api/auth/login/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import { signToken } from '@/lib/auth';
import { handleRouteError, jsonError, readJson } from '@/lib/http';
import { toPrivateUser } from '@/lib/user-response';

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    if (!body) return jsonError('Invalid request body', 400);

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) {
      return jsonError('Email and password are required', 400);
    }

    await connectToDatabase();

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return jsonError('Invalid credentials', 401);
    }

    const token = await signToken({ id: String(user._id), username: user.username, email: user.email });
    return NextResponse.json({ token, user: toPrivateUser(user) });
  } catch (error) {
    return handleRouteError(error, 'Login error', 'Login failed');
  }
}
```

- [ ] **Step 11: Run the section and watch it pass**

Run: `npm run smoke -- auth`
Expected: 14 `ok` lines, `cleanup: ... users=2`, `14 checks, 0 failed`.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "Unify auth on jose and validate login and register input

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Posts API

**Files:**
- Modify: `models/Post.ts` (`saved` becomes `savedBy`)
- Rewrite: `app/api/posts/route.ts`, `app/api/posts/[id]/route.ts`, `app/api/posts/[id]/like/route.ts`, `app/api/posts/[id]/comments/route.ts`, `app/api/posts/similar/[id]/route.ts`
- Create: `app/api/posts/[id]/save/route.ts`
- Test: `scripts/smoke.mjs` (`posts` section)

**Interfaces:**
- Consumes: `requireAuth`, `jsonError`, `readJson`, `isValidId`, `isHttpUrl`, `handleRouteError`, `createNotification`, `notifyMentions`, `connectToDatabase`.
- Produces: a post document is `{ _id, author: { username, avatar }, caption, image?, video?, code?, language?, likes: number, likedBy: string[], savedBy: string[], comments: Array<{ _id, username, avatar, text, likes, createdAt }>, createdAt, updatedAt }`. `POST /api/posts` answers 201 with the post. `POST /api/posts/[id]/like` and `/save` answer 200 with the whole updated post. `POST /api/posts/[id]/comments` answers 201 with the stored comment.

- [ ] **Step 1: Add the `posts` smoke section**

In `scripts/smoke.mjs`, add to `sections`:

```js
  async posts() {
    await ensureUsers()
    const { a, b } = state
    const missingId = "0123456789abcdef01234567"

    const noToken = await api("POST", "/api/posts", { body: { caption: "x" } })
    check("create without token is 401", noToken.status === 401, `status ${noToken.status}`)
    const garbage = await api("POST", "/api/posts", { token: "not.a.token", body: { caption: "x" } })
    check("create with garbage token is 401", garbage.status === 401, `status ${garbage.status}`)
    const noCaption = await api("POST", "/api/posts", { token: a.token, body: { image: "https://example.com/a.png" } })
    check("create without caption is 400", noCaption.status === 400, `status ${noCaption.status}`)
    const wrongType = await api("POST", "/api/posts", { token: a.token, body: { caption: 42 } })
    check("caption wrong type is 400", wrongType.status === 400, `status ${wrongType.status}`)
    const jsUrl = await api("POST", "/api/posts", {
      token: a.token,
      body: { caption: "bad", image: "javascript:alert(1)" },
    })
    check("javascript: image url is 400", jsUrl.status === 400, `status ${jsUrl.status}`)

    const image = await api("POST", "/api/posts", {
      token: a.token,
      body: { caption: `image post ${run}`, image: "https://example.com/a.png" },
    })
    check("create image post is 201", image.status === 201, `status ${image.status} ${image.text.slice(0, 120)}`)
    check("post author is the caller", image.data?.author?.username === names.a)
    check("post author avatar is the placeholder", image.data?.author?.avatar === "/placeholder.svg")
    check("new post has empty likedBy and savedBy", image.data?.likedBy?.length === 0 && image.data?.savedBy?.length === 0)
    const code = await api("POST", "/api/posts", {
      token: a.token,
      body: { caption: `code post ${run} cc @${names.b}`, code: "const x = 1", language: "javascript" },
    })
    check("create code post is 201", code.status === 201, `status ${code.status}`)
    const postId = image.data?._id
    const codeId = code.data?._id

    const list = await api("GET", "/api/posts")
    const ids = Array.isArray(list.data) ? list.data.map((p) => p._id) : []
    check("list includes both posts", list.status === 200 && ids.includes(postId) && ids.includes(codeId))
    check("list is newest first", ids.indexOf(codeId) < ids.indexOf(postId))

    const one = await api("GET", `/api/posts/${postId}`)
    check("get post is 200", one.status === 200 && one.data?._id === postId, `status ${one.status}`)
    const malformedId = await api("GET", "/api/posts/not-an-id")
    check("malformed id is 404", malformedId.status === 404, `status ${malformedId.status}`)
    const absent = await api("GET", `/api/posts/${missingId}`)
    check("unknown id is 404", absent.status === 404, `status ${absent.status}`)

    const likeAnon = await api("POST", `/api/posts/${postId}/like`)
    check("like without token is 401", likeAnon.status === 401, `status ${likeAnon.status}`)
    const like = await api("POST", `/api/posts/${postId}/like`, { token: b.token })
    check("like adds the user", like.status === 200 && like.data?.likes === 1 && like.data?.likedBy?.includes(names.b), like.text.slice(0, 120))
    const unlike = await api("POST", `/api/posts/${postId}/like`, { token: b.token })
    check("second like removes the user", unlike.data?.likes === 0 && !unlike.data?.likedBy?.includes(names.b))
    await Promise.all([
      api("POST", `/api/posts/${postId}/like`, { token: b.token }),
      api("POST", `/api/posts/${postId}/like`, { token: b.token }),
    ])
    const afterRace = await api("GET", `/api/posts/${postId}`)
    check(
      "parallel likes stay consistent",
      afterRace.data?.likes === afterRace.data?.likedBy?.length && afterRace.data?.likes >= 0,
      `likes ${afterRace.data?.likes} likedBy ${afterRace.data?.likedBy?.length}`,
    )
    const likeMissing = await api("POST", `/api/posts/${missingId}/like`, { token: b.token })
    check("like unknown post is 404", likeMissing.status === 404, `status ${likeMissing.status}`)

    const saveAnon = await api("POST", `/api/posts/${postId}/save`)
    check("save without token is 401", saveAnon.status === 401, `status ${saveAnon.status}`)
    const save = await api("POST", `/api/posts/${postId}/save`, { token: b.token })
    check("save adds only the caller", save.status === 200 && save.data?.savedBy?.includes(names.b) && !save.data?.savedBy?.includes(names.a), save.text.slice(0, 120))
    const unsave = await api("POST", `/api/posts/${postId}/save`, { token: b.token })
    check("second save removes the caller", unsave.status === 200 && !unsave.data?.savedBy?.includes(names.b))

    const commentAnon = await api("POST", `/api/posts/${postId}/comments`, { body: { text: "hi" } })
    check("comment without token is 401", commentAnon.status === 401, `status ${commentAnon.status}`)
    const emptyComment = await api("POST", `/api/posts/${postId}/comments`, { token: b.token, body: { text: "   " } })
    check("empty comment is 400", emptyComment.status === 400, `status ${emptyComment.status}`)
    const comment = await api("POST", `/api/posts/${postId}/comments`, { token: b.token, body: { text: "nice one" } })
    check(
      "comment is 201 with id, author and text",
      comment.status === 201 && typeof comment.data?._id === "string" && comment.data?.username === names.b && comment.data?.text === "nice one",
      `status ${comment.status} ${comment.text.slice(0, 120)}`,
    )
    const comments = await api("GET", `/api/posts/${postId}/comments`)
    check("comments list has the comment", comments.status === 200 && comments.data?.length === 1)

    const similar = await api("GET", `/api/posts/similar/${codeId}`)
    check("similar is 200 with an array", similar.status === 200 && Array.isArray(similar.data), `status ${similar.status}`)
    check("similar excludes the post itself", !similar.data?.some((p) => p._id === codeId))
    check("similar includes the author's other post", similar.data?.some((p) => p._id === postId))

    const deleteOther = await api("DELETE", `/api/posts/${postId}`, { token: b.token })
    check("delete by non-author is 403", deleteOther.status === 403, `status ${deleteOther.status}`)
    const deleteOwn = await api("DELETE", `/api/posts/${postId}`, { token: a.token })
    check("delete by author is 200", deleteOwn.status === 200, `status ${deleteOwn.status}`)
    const gone = await api("GET", `/api/posts/${postId}`)
    check("deleted post is 404", gone.status === 404, `status ${gone.status}`)
  },
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run smoke -- posts`
Expected: failures, including `FAIL caption wrong type is 400`, `FAIL malformed id is 404` (a 500 today), `FAIL save adds only the caller` (no such route) and `FAIL comment is 201 with id, author and text` (always 401 today).

- [ ] **Step 3: Replace `saved` with `savedBy` in `models/Post.ts`**

In the `IPost` interface, replace `saved: boolean;` with:

```ts
  savedBy: string[];
```

In `postSchema`, replace the `saved` field with:

```ts
    savedBy: {
      type: [String],
      default: []
    },
```

- [ ] **Step 4: Rewrite `app/api/posts/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Post from '@/models/Post';
import User from '@/models/User';
import { requireAuth } from '@/lib/auth';
import { handleRouteError, isHttpUrl, jsonError, readJson } from '@/lib/http';
import { notifyMentions } from '@/lib/notifications';

// Get all posts, newest first
export async function GET() {
  try {
    await connectToDatabase();
    const posts = await Post.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json(posts);
  } catch (error) {
    return handleRouteError(error, 'Get posts error', 'Failed to get posts');
  }
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// Create a new post
export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const body = await readJson(req);
    if (!body) return jsonError('Invalid request body', 400);

    const caption = optionalString(body.caption);
    if (!caption) return jsonError('Caption is required for posts', 400);

    const image = optionalString(body.image);
    const video = optionalString(body.video);
    // Code keeps its own whitespace, so it is not trimmed.
    const code = typeof body.code === 'string' && body.code.trim() ? body.code : undefined;
    const language = optionalString(body.language);

    if (image && !isHttpUrl(image)) return jsonError('Image must be an http(s) URL', 400);
    if (video && !isHttpUrl(video)) return jsonError('Video must be an http(s) URL', 400);

    await connectToDatabase();

    const author = await User.findOne({ username: auth.username }).select('username avatar').lean();
    if (!author) return jsonError('Authentication required', 401);

    const post = await Post.create({
      author: {
        username: auth.username,
        avatar: (author as { avatar?: string }).avatar || '/placeholder.svg',
      },
      caption,
      image,
      video,
      code,
      language: code ? language : undefined,
    });

    await notifyMentions(auth.username, caption, 'mentioned you in a post', post._id.toString());

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Create post error', 'Failed to create post');
  }
}
```

- [ ] **Step 5: Rewrite `app/api/posts/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Post from '@/models/Post';
import { requireAuth } from '@/lib/auth';
import { handleRouteError, isValidId, jsonError } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };

// Get a single post
export async function GET(_req: Request, { params }: Context) {
  try {
    const { id } = await params;
    if (!isValidId(id)) return jsonError('Post not found', 404);

    await connectToDatabase();
    const post = await Post.findById(id).lean();
    if (!post) return jsonError('Post not found', 404);

    return NextResponse.json(post);
  } catch (error) {
    return handleRouteError(error, 'Fetch post error', 'Failed to fetch post');
  }
}

// Delete a post (author only)
export async function DELETE(req: Request, { params }: Context) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    if (!isValidId(id)) return jsonError('Post not found', 404);

    await connectToDatabase();
    const post = await Post.findById(id);
    if (!post) return jsonError('Post not found', 404);
    if (post.author.username !== auth.username) return jsonError('Not authorized', 403);

    await post.deleteOne();
    return NextResponse.json({ message: 'Post deleted successfully' });
  } catch (error) {
    return handleRouteError(error, 'Delete post error', 'Failed to delete post');
  }
}
```

- [ ] **Step 6: Rewrite `app/api/posts/[id]/like/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Post from '@/models/Post';
import { requireAuth } from '@/lib/auth';
import { handleRouteError, isValidId, jsonError } from '@/lib/http';
import { createNotification } from '@/lib/notifications';

// Toggle the caller's like. Each branch is one atomic update, so racing
// requests cannot double-count.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    if (!isValidId(id)) return jsonError('Post not found', 404);

    await connectToDatabase();

    const liked = await Post.findOneAndUpdate(
      { _id: id, likedBy: { $ne: auth.username } },
      { $addToSet: { likedBy: auth.username }, $inc: { likes: 1 } },
      { new: true }
    );
    if (liked) {
      await createNotification(auth.username, liked.author.username, 'like', 'liked your post', liked._id.toString());
      return NextResponse.json(liked);
    }

    const unliked = await Post.findOneAndUpdate(
      { _id: id, likedBy: auth.username },
      { $pull: { likedBy: auth.username }, $inc: { likes: -1 } },
      { new: true }
    );
    if (unliked) return NextResponse.json(unliked);

    return jsonError('Post not found', 404);
  } catch (error) {
    return handleRouteError(error, 'Like post error', 'Failed to update like');
  }
}
```

- [ ] **Step 7: Create `app/api/posts/[id]/save/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Post from '@/models/Post';
import { requireAuth } from '@/lib/auth';
import { handleRouteError, isValidId, jsonError } from '@/lib/http';

// Toggle the caller's save.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    if (!isValidId(id)) return jsonError('Post not found', 404);

    await connectToDatabase();

    const saved = await Post.findOneAndUpdate(
      { _id: id, savedBy: { $ne: auth.username } },
      { $addToSet: { savedBy: auth.username } },
      { new: true }
    );
    if (saved) return NextResponse.json(saved);

    const unsaved = await Post.findOneAndUpdate(
      { _id: id, savedBy: auth.username },
      { $pull: { savedBy: auth.username } },
      { new: true }
    );
    if (unsaved) return NextResponse.json(unsaved);

    return jsonError('Post not found', 404);
  } catch (error) {
    return handleRouteError(error, 'Save post error', 'Failed to update save');
  }
}
```

- [ ] **Step 8: Rewrite `app/api/posts/[id]/comments/route.ts`**

```ts
import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import Post from "@/models/Post"
import User from "@/models/User"
import { requireAuth } from "@/lib/auth"
import { handleRouteError, isValidId, jsonError, readJson } from "@/lib/http"
import { createNotification, notifyMentions } from "@/lib/notifications"

type Context = { params: Promise<{ id: string }> }

// Add a comment to a post
export async function POST(req: Request, { params }: Context) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    if (!isValidId(id)) return jsonError("Post not found", 404)

    const body = await readJson(req)
    const text = typeof body?.text === "string" ? body.text.trim() : ""
    if (!text) return jsonError("Comment text is required", 400)
    if (text.length > 1000) return jsonError("Comment must be 1000 characters or fewer", 400)

    await connectToDatabase()

    const commenter = await User.findOne({ username: auth.username }).select("avatar").lean()
    if (!commenter) return jsonError("Authentication required", 401)

    const post = await Post.findByIdAndUpdate(
      id,
      {
        $push: {
          comments: {
            username: auth.username,
            avatar: (commenter as { avatar?: string }).avatar || "/placeholder.svg",
            text,
          },
        },
      },
      { new: true }
    )
    if (!post) return jsonError("Post not found", 404)

    const comment = post.comments[post.comments.length - 1]
    const author = post.author.username
    const postId = post._id.toString()

    await createNotification(auth.username, author, "comment", "commented on your post", postId)
    await notifyMentions(auth.username, text, "mentioned you in a comment", postId, [author])

    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    return handleRouteError(error, "Add comment error", "Failed to add comment")
  }
}

// Get comments for a post
export async function GET(_req: Request, { params }: Context) {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonError("Post not found", 404)

    await connectToDatabase()
    const post = await Post.findById(id).select("comments").lean()
    if (!post) return jsonError("Post not found", 404)

    return NextResponse.json((post as { comments?: unknown[] }).comments || [])
  } catch (error) {
    return handleRouteError(error, "Get comments error", "Failed to get comments")
  }
}
```

- [ ] **Step 9: Rewrite `app/api/posts/similar/[id]/route.ts`**

```ts
import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import Post from "@/models/Post"
import { handleRouteError, isValidId, jsonError } from "@/lib/http"

// Posts in the same language, or by the same author.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonError("Post not found", 404)

    await connectToDatabase()

    const current = await Post.findById(id).select("author language").lean()
    if (!current) return jsonError("Post not found", 404)

    const { author, language } = current as { author: { username: string }; language?: string }
    const matches: Array<Record<string, string>> = [{ "author.username": author.username }]
    if (language) matches.push({ language })

    const similarPosts = await Post.find({ _id: { $ne: id }, $or: matches })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean()

    return NextResponse.json(similarPosts)
  } catch (error) {
    return handleRouteError(error, "Similar posts error", "Failed to fetch similar posts")
  }
}
```

- [ ] **Step 10: Run the section and watch it pass**

Run: `npm run smoke -- posts`
Expected: 33 `ok` lines, `33 checks, 0 failed`.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Fix posts API: per-user saves, atomic likes, working comments

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Users API (public profile, own profile, follow)

**Files:**
- Rewrite: `app/api/users/[username]/route.ts`, `app/api/users/profile/route.ts`, `app/api/users/[username]/follow/route.ts`
- Test: `scripts/smoke.mjs` (`users` section)

**Interfaces:**
- Consumes: `requireAuth`, `getAuthUser`, `jsonError`, `readJson`, `isHttpUrl`, `handleRouteError`, `toPrivateUser`, `NOTIFICATION_DEFAULTS`, `PRIVACY_DEFAULTS`, `createNotification`.
- Produces: `GET /api/users/[username]` answers `{ _id, username, fullName, avatar, bio, website, followers: number, following: number, isVerified, isFollowing: boolean }`. `GET` and `PATCH /api/users/profile` answer the `toPrivateUser` shape. `POST /api/users/[username]/follow` answers `{ following: boolean, followers: number, followingCount: number }`.

- [ ] **Step 1: Add the `users` smoke section**

In `scripts/smoke.mjs`, add to `sections`:

```js
  async users() {
    await ensureUsers()
    const { a, b } = state

    const pub = await api("GET", `/api/users/${names.a}`)
    check("public profile is 200", pub.status === 200 && pub.data?.username === names.a, `status ${pub.status}`)
    check("public profile hides password and email", !("password" in (pub.data || {})) && !("email" in (pub.data || {})))
    check("public profile hides settings", !("notificationSettings" in (pub.data || {})) && !("privacySettings" in (pub.data || {})))
    check("public profile has numeric counts", pub.data?.followers === 0 && pub.data?.following === 0)
    check("anonymous viewer is not following", pub.data?.isFollowing === false)
    const nobody = await api("GET", `/api/users/nobody_${run}`)
    check("unknown user is 404", nobody.status === 404, `status ${nobody.status}`)

    const meAnon = await api("GET", "/api/users/profile")
    check("own profile without token is 401", meAnon.status === 401, `status ${meAnon.status}`)
    const meGarbage = await api("GET", "/api/users/profile", { token: "not.a.token" })
    check("own profile with garbage token is 401", meGarbage.status === 401, `status ${meGarbage.status}`)
    const me = await api("GET", "/api/users/profile", { token: a.token })
    check("own profile is 200 with email and settings", me.status === 200 && me.data?.email === `${names.a}@example.com` && me.data?.privacySettings?.isPrivate === false, me.text.slice(0, 120))

    const edit = await api("PATCH", "/api/users/profile", {
      token: a.token,
      body: { fullName: "Smoke Edited", bio: "hello", website: "https://example.com", avatar: "https://example.com/me.png" },
    })
    check(
      "profile edit is 200 and applied",
      edit.status === 200 && edit.data?.fullName === "Smoke Edited" && edit.data?.bio === "hello" && edit.data?.website === "https://example.com" && edit.data?.avatar === "https://example.com/me.png",
      `status ${edit.status} ${edit.text.slice(0, 120)}`,
    )
    const clear = await api("PATCH", "/api/users/profile", { token: a.token, body: { bio: "", website: "", avatar: "" } })
    check("bio and website can be cleared", clear.data?.bio === "" && clear.data?.website === "")
    check("clearing avatar restores the placeholder", clear.data?.avatar === "/placeholder.svg")
    const jsSite = await api("PATCH", "/api/users/profile", { token: a.token, body: { website: "javascript:alert(1)" } })
    check("javascript: website is 400", jsSite.status === 400, `status ${jsSite.status}`)
    const jsAvatar = await api("PATCH", "/api/users/profile", { token: a.token, body: { avatar: "javascript:alert(1)" } })
    check("javascript: avatar is 400", jsAvatar.status === 400, `status ${jsAvatar.status}`)
    const rename = await api("PATCH", "/api/users/profile", { token: a.token, body: { username: `${names.a}_new` } })
    check("username change is 400", rename.status === 400, `status ${rename.status}`)
    const takenEmail = await api("PATCH", "/api/users/profile", { token: a.token, body: { email: `${names.b}@example.com` } })
    check("taken email is 409", takenEmail.status === 409, `status ${takenEmail.status}`)
    const patchAnon = await api("PATCH", "/api/users/profile", { body: { bio: "x" } })
    check("profile edit without token is 401", patchAnon.status === 401, `status ${patchAnon.status}`)

    const notif = await api("PATCH", "/api/users/profile", { token: a.token, body: { notificationSettings: { likes: false, bogus: true } } })
    check(
      "notification settings merge",
      notif.data?.notificationSettings?.likes === false && notif.data?.notificationSettings?.comments === true && !("bogus" in (notif.data?.notificationSettings || {})),
      notif.text.slice(0, 160),
    )
    const privacy = await api("PATCH", "/api/users/profile", { token: a.token, body: { privacySettings: { isPrivate: true } } })
    check("privacy settings merge", privacy.data?.privacySettings?.isPrivate === true && privacy.data?.privacySettings?.allowMessaging === true)
    const reread = await api("GET", "/api/users/profile", { token: a.token })
    check("settings persist", reread.data?.notificationSettings?.likes === false && reread.data?.privacySettings?.isPrivate === true)

    const wrongPw = await api("PATCH", "/api/users/profile", { token: a.token, body: { currentPassword: "wrong-one", newPassword: "smoke-pass-2" } })
    check("wrong current password is 400", wrongPw.status === 400, `status ${wrongPw.status}`)
    const shortPw = await api("PATCH", "/api/users/profile", { token: a.token, body: { currentPassword: a.password, newPassword: "123" } })
    check("short new password is 400", shortPw.status === 400, `status ${shortPw.status}`)
    const changePw = await api("PATCH", "/api/users/profile", { token: a.token, body: { currentPassword: a.password, newPassword: "smoke-pass-2" } })
    check("password change is 200", changePw.status === 200, `status ${changePw.status}`)
    const oldLogin = await api("POST", "/api/auth/login", { body: { email: `${names.a}@example.com`, password: a.password } })
    check("old password no longer works", oldLogin.status === 401, `status ${oldLogin.status}`)
    const newLogin = await api("POST", "/api/auth/login", { body: { email: `${names.a}@example.com`, password: "smoke-pass-2" } })
    check("new password works", newLogin.status === 200, `status ${newLogin.status}`)
    a.password = "smoke-pass-2"

    const followAnon = await api("POST", `/api/users/${names.a}/follow`)
    check("follow without token is 401", followAnon.status === 401, `status ${followAnon.status}`)
    const followSelf = await api("POST", `/api/users/${names.a}/follow`, { token: a.token })
    check("follow yourself is 400", followSelf.status === 400, `status ${followSelf.status}`)
    const followNobody = await api("POST", `/api/users/nobody_${run}/follow`, { token: b.token })
    check("follow unknown user is 404", followNobody.status === 404, `status ${followNobody.status}`)
    const follow = await api("POST", `/api/users/${names.a}/follow`, { token: b.token })
    check("follow sets following and counts", follow.status === 200 && follow.data?.following === true && follow.data?.followers === 1 && follow.data?.followingCount === 1, follow.text.slice(0, 120))
    const seenByB = await api("GET", `/api/users/${names.a}`, { token: b.token })
    check("follower sees isFollowing true", seenByB.data?.isFollowing === true && seenByB.data?.followers === 1)
    const bProfile = await api("GET", `/api/users/${names.b}`)
    check("follower's following count is 1", bProfile.data?.following === 1)
    const unfollow = await api("POST", `/api/users/${names.a}/follow`, { token: b.token })
    check("second follow unfollows", unfollow.data?.following === false && unfollow.data?.followers === 0 && unfollow.data?.followingCount === 0, unfollow.text.slice(0, 120))
  },
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run smoke -- users`
Expected: failures, including `FAIL own profile is 200 with email and settings` (there is no `GET` handler yet) and `FAIL profile edit is 200 and applied` (the route still uses `next-auth`).

- [ ] **Step 3: Rewrite `app/api/users/[username]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import { getAuthUser } from '@/lib/auth';
import { handleRouteError, jsonError } from '@/lib/http';

// Public profile. isFollowing reflects the caller when a valid token is sent.
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await params;

    await connectToDatabase();

    const user = await User.findOne({ username })
      .select('username fullName avatar bio website followers following isVerified')
      .lean();
    if (!user) return jsonError('User not found', 404);

    const profile = user as {
      _id: unknown;
      username: string;
      fullName: string;
      avatar?: string;
      bio?: string;
      website?: string;
      followers?: number;
      following?: unknown[];
      isVerified?: boolean;
    };

    const viewer = await getAuthUser(req);
    const isFollowing = viewer
      ? Boolean(await User.exists({ username: viewer.username, following: profile._id }))
      : false;

    return NextResponse.json({
      _id: profile._id,
      username: profile.username,
      fullName: profile.fullName,
      avatar: profile.avatar || '/placeholder.svg',
      bio: profile.bio || '',
      website: profile.website || '',
      followers: profile.followers || 0,
      following: profile.following ? profile.following.length : 0,
      isVerified: Boolean(profile.isVerified),
      isFollowing,
    });
  } catch (error) {
    return handleRouteError(error, 'Fetch user error', 'Failed to fetch user');
  }
}
```

- [ ] **Step 4: Rewrite `app/api/users/profile/route.ts`**

```ts
import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import User from "@/models/User"
import { requireAuth } from "@/lib/auth"
import { handleRouteError, isHttpUrl, jsonError, readJson } from "@/lib/http"
import {
  NOTIFICATION_DEFAULTS,
  PRIVACY_DEFAULTS,
  toPrivateUser,
  type NotificationKey,
  type PrivacyKey,
} from "@/lib/user-response"

// The signed-in user's own account, including settings.
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    await connectToDatabase()
    const user = await User.findOne({ username: auth.username })
    if (!user) return jsonError("Authentication required", 401)

    return NextResponse.json(toPrivateUser(user))
  } catch (error) {
    return handleRouteError(error, "Fetch profile error", "Failed to fetch profile")
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const data = await readJson(req)
    if (!data) return jsonError("Invalid request body", 400)

    await connectToDatabase()
    const user = await User.findOne({ username: auth.username })
    if (!user) return jsonError("Authentication required", 401)

    if (data.username !== undefined && data.username !== user.username) {
      return jsonError("Username cannot be changed", 400)
    }

    if (data.fullName !== undefined) {
      if (typeof data.fullName !== "string" || !data.fullName.trim()) {
        return jsonError("Full name is required", 400)
      }
      user.fullName = data.fullName.trim()
    }

    if (data.bio !== undefined) {
      if (typeof data.bio !== "string") return jsonError("Bio must be text", 400)
      if (data.bio.length > 500) return jsonError("Bio must be 500 characters or fewer", 400)
      user.bio = data.bio
    }

    if (data.website !== undefined) {
      if (typeof data.website !== "string") return jsonError("Website must be text", 400)
      const website = data.website.trim()
      if (website && !isHttpUrl(website)) return jsonError("Website must be an http(s) URL", 400)
      user.website = website
    }

    if (data.avatar !== undefined) {
      if (typeof data.avatar !== "string") return jsonError("Avatar must be text", 400)
      const avatar = data.avatar.trim()
      if (avatar && avatar !== "/placeholder.svg" && !isHttpUrl(avatar)) {
        return jsonError("Avatar must be an http(s) URL", 400)
      }
      user.avatar = avatar || "/placeholder.svg"
    }

    if (data.email !== undefined) {
      if (typeof data.email !== "string") return jsonError("Email must be text", 400)
      const email = data.email.trim().toLowerCase()
      if (!/^\S+@\S+\.\S+$/.test(email)) return jsonError("Please enter a valid email address", 400)
      if (email !== user.email) {
        if (await User.exists({ email })) return jsonError("Email is already taken", 409)
        user.email = email
      }
    }

    if (data.newPassword !== undefined && data.newPassword !== "") {
      if (typeof data.newPassword !== "string" || typeof data.currentPassword !== "string" || !data.currentPassword) {
        return jsonError("Current password is required", 400)
      }
      if (!(await user.comparePassword(data.currentPassword))) {
        return jsonError("Current password is incorrect", 400)
      }
      if (data.newPassword.length < 6) {
        return jsonError("Password must be at least 6 characters long", 400)
      }
      // The pre-save hook on the User model hashes this.
      user.password = data.newPassword
    }

    if (data.notificationSettings && typeof data.notificationSettings === "object") {
      const incoming = data.notificationSettings as Record<string, unknown>
      for (const key of Object.keys(NOTIFICATION_DEFAULTS) as NotificationKey[]) {
        if (typeof incoming[key] === "boolean") user.notificationSettings[key] = incoming[key] as boolean
      }
    }

    if (data.privacySettings && typeof data.privacySettings === "object") {
      const incoming = data.privacySettings as Record<string, unknown>
      for (const key of Object.keys(PRIVACY_DEFAULTS) as PrivacyKey[]) {
        if (typeof incoming[key] === "boolean") user.privacySettings[key] = incoming[key] as boolean
      }
    }

    await user.save()

    return NextResponse.json(toPrivateUser(user))
  } catch (error) {
    return handleRouteError(error, "Update profile error", "Failed to update profile")
  }
}
```

- [ ] **Step 5: Rewrite `app/api/users/[username]/follow/route.ts`**

```ts
import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import User from "@/models/User"
import { requireAuth } from "@/lib/auth"
import { handleRouteError, jsonError } from "@/lib/http"
import { createNotification } from "@/lib/notifications"

// Toggle whether the caller follows :username.
export async function POST(req: Request, { params }: { params: Promise<{ username: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { username: targetUsername } = await params
    if (targetUsername === auth.username) return jsonError("You cannot follow yourself", 400)

    await connectToDatabase()

    const target = await User.findOne({ username: targetUsername }).select("_id").lean()
    if (!target) return jsonError("User not found", 404)
    const targetId = (target as { _id: unknown })._id

    let following: boolean
    const followed = await User.updateOne(
      { username: auth.username, following: { $ne: targetId } },
      { $addToSet: { following: targetId }, $inc: { followingCount: 1 } }
    )

    if (followed.modifiedCount === 1) {
      await User.updateOne({ _id: targetId }, { $inc: { followers: 1 } })
      await createNotification(auth.username, targetUsername, "follow", "started following you")
      following = true
    } else {
      const unfollowed = await User.updateOne(
        { username: auth.username, following: targetId },
        { $pull: { following: targetId }, $inc: { followingCount: -1 } }
      )
      if (unfollowed.modifiedCount !== 1) return jsonError("Authentication required", 401)
      await User.updateOne({ _id: targetId, followers: { $gt: 0 } }, { $inc: { followers: -1 } })
      following = false
    }

    const [updatedTarget, updatedSelf] = await Promise.all([
      User.findById(targetId).select("followers").lean(),
      User.findOne({ username: auth.username }).select("followingCount").lean(),
    ])

    return NextResponse.json({
      following,
      followers: (updatedTarget as { followers?: number } | null)?.followers || 0,
      followingCount: (updatedSelf as { followingCount?: number } | null)?.followingCount || 0,
    })
  } catch (error) {
    return handleRouteError(error, "Follow/unfollow error", "Failed to follow/unfollow user")
  }
}
```

- [ ] **Step 6: Run the section and watch it pass**

Run: `npm run smoke -- users`
Expected: 32 `ok` lines, `32 checks, 0 failed`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Fix users API: working profile edits, settings and follow

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Messages, notifications and search API; retire the old auth code

**Files:**
- Rewrite: `app/api/messages/route.ts`, `app/api/messages/[username]/route.ts`, `app/api/notifications/route.ts`, `app/api/search/route.ts`
- Delete: `middleware/auth.ts`, `lib/db.ts`
- Modify: `package.json` (remove four dependencies)
- Test: `scripts/smoke.mjs` (`social` section)

**Interfaces:**
- Consumes: `requireAuth`, `jsonError`, `readJson`, `isValidId`, `handleRouteError`, `escapeRegex`, `createNotification`.
- Produces: `GET /api/messages` answers `Array<{ username, avatar, lastMessage: { content, timestamp, sender } }>`. `POST /api/messages` answers 201 with `{ _id, sender, receiver, content, createdAt }`. `GET /api/notifications` answers `Array<{ _id, type, content, postId?, read, createdAt, user: { username, avatar } }>`. `GET /api/search?q=&type=all|users|posts` is public and answers `{ users: Array<{ _id, username, fullName, avatar, bio }>, posts: Post[] }`.

- [ ] **Step 1: Add the `social` smoke section**

In `scripts/smoke.mjs`, add to `sections`:

```js
  async social() {
    await ensureUsers()
    const { a, b } = state

    const msgAnon = await api("POST", "/api/messages", { body: { receiver: names.a, content: "hi" } })
    check("message without token is 401", msgAnon.status === 401, `status ${msgAnon.status}`)
    const msgEmpty = await api("POST", "/api/messages", { token: b.token, body: { receiver: names.a, content: "  " } })
    check("empty message is 400", msgEmpty.status === 400, `status ${msgEmpty.status}`)
    const msgNobody = await api("POST", "/api/messages", { token: b.token, body: { receiver: `nobody_${run}`, content: "hi" } })
    check("message to unknown user is 404", msgNobody.status === 404, `status ${msgNobody.status}`)
    const msgSelf = await api("POST", "/api/messages", { token: b.token, body: { receiver: names.b, content: "hi" } })
    check("message to yourself is 400", msgSelf.status === 400, `status ${msgSelf.status}`)
    const msg = await api("POST", "/api/messages", { token: b.token, body: { receiver: names.a, content: `hello ${run}` } })
    check("message is 201", msg.status === 201 && msg.data?.sender === names.b && msg.data?.content === `hello ${run}`, `status ${msg.status} ${msg.text.slice(0, 120)}`)

    const convAnon = await api("GET", "/api/messages")
    check("conversations without token is 401", convAnon.status === 401, `status ${convAnon.status}`)
    const conv = await api("GET", "/api/messages", { token: a.token })
    const withB = Array.isArray(conv.data) ? conv.data.find((c) => c.username === names.b) : null
    check("receiver sees the conversation", conv.status === 200 && withB?.lastMessage?.content === `hello ${run}`, conv.text.slice(0, 160))
    const thread = await api("GET", `/api/messages/${names.b}`, { token: a.token })
    check("thread has the message", thread.status === 200 && thread.data?.length === 1 && thread.data[0].content === `hello ${run}`, `status ${thread.status}`)
    const threadAnon = await api("GET", `/api/messages/${names.b}`)
    check("thread without token is 401", threadAnon.status === 401, `status ${threadAnon.status}`)

    const post = await api("POST", "/api/posts", { token: a.token, body: { caption: `searchable${run} cc @${names.b}`, code: "x", language: "python" } })
    const postId = post.data?._id
    await api("POST", `/api/users/${names.a}/follow`, { token: b.token })
    await api("POST", `/api/posts/${postId}/like`, { token: b.token })
    await api("POST", `/api/posts/${postId}/comments`, { token: b.token, body: { text: "commenting" } })
    await api("POST", `/api/posts/${postId}/like`, { token: a.token })

    const notifAnon = await api("GET", "/api/notifications")
    check("notifications without token is 401", notifAnon.status === 401, `status ${notifAnon.status}`)
    const notifs = await api("GET", "/api/notifications", { token: a.token })
    const types = Array.isArray(notifs.data) ? notifs.data.map((n) => n.type) : []
    check("notifications is 200", notifs.status === 200, `status ${notifs.status} ${notifs.text.slice(0, 120)}`)
    for (const type of ["message", "follow", "like", "comment"]) {
      check(`has a ${type} notification`, types.includes(type), `types ${types.join(",")}`)
    }
    check("notifications carry the sender", notifs.data?.every?.((n) => n.user?.username === names.b))
    check("liking your own post does not notify you", notifs.data?.filter?.((n) => n.type === "like" && n.postId === postId).length === 1)
    const bNotifs = await api("GET", "/api/notifications", { token: b.token })
    check("mentioned user gets a mention notification", bNotifs.data?.some?.((n) => n.type === "mention" && n.postId === postId))

    const ids = (notifs.data || []).map((n) => n._id)
    const markBad = await api("PATCH", "/api/notifications", { token: a.token, body: { notificationIds: "nope" } })
    check("mark read with bad body is 400", markBad.status === 400, `status ${markBad.status}`)
    const markOther = await api("PATCH", "/api/notifications", { token: b.token, body: { notificationIds: ids } })
    check("marking someone else's notifications changes nothing", markOther.status === 200 && markOther.data?.modified === 0, markOther.text.slice(0, 120))
    const mark = await api("PATCH", "/api/notifications", { token: a.token, body: { notificationIds: ids } })
    check("mark read is 200", mark.status === 200 && mark.data?.modified === ids.length, mark.text.slice(0, 120))
    const after = await api("GET", "/api/notifications", { token: a.token })
    check("notifications are read", after.data?.every?.((n) => n.read === true))

    const noQuery = await api("GET", "/api/search")
    check("search without q is 400", noQuery.status === 400, `status ${noQuery.status}`)
    const users = await api("GET", `/api/search?q=${run}&type=users`)
    check("search finds both users without a token", users.status === 200 && users.data?.users?.length === 2 && users.data?.posts?.length === 0, users.text.slice(0, 160))
    check("search results hide email and password", users.data?.users?.every?.((u) => !("email" in u) && !("password" in u)))
    const posts = await api("GET", `/api/search?q=searchable${run}&type=posts`)
    check("search finds the post by caption", posts.data?.posts?.some?.((p) => p._id === postId && p.caption.includes(`searchable${run}`)))
    const byComment = await api("GET", "/api/search?q=commenting&type=posts")
    check("search finds the post by comment text", byComment.data?.posts?.some?.((p) => p._id === postId))
    const meta = await api("GET", `/api/search?q=${encodeURIComponent("(.*")}`)
    check("regex metacharacters are 200 with no matches", meta.status === 200 && meta.data?.users?.length === 0, `status ${meta.status}`)
  },
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run smoke -- social`
Expected: failures. The four routes import `authMiddleware` from `@/lib/auth`, which Task 2 removed, so they answer 500.

- [ ] **Step 3: Rewrite `app/api/messages/route.ts`**

```ts
import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import { requireAuth } from "@/lib/auth"
import { handleRouteError, jsonError, readJson } from "@/lib/http"
import { createNotification } from "@/lib/notifications"
import Message from "@/models/Message"
import User from "@/models/User"

// Get all conversations for the current user, most recent first
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    await connectToDatabase()

    const conversations = await Message.aggregate([
      { $match: { $or: [{ sender: auth.username }, { receiver: auth.username }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { $cond: [{ $eq: ["$sender", auth.username] }, "$receiver", "$sender"] },
          lastMessage: { $first: "$$ROOT" },
        },
      },
      { $lookup: { from: "users", localField: "_id", foreignField: "username", as: "user" } },
      { $unwind: "$user" },
      { $sort: { "lastMessage.createdAt": -1 } },
      {
        $project: {
          _id: 0,
          username: "$user.username",
          avatar: "$user.avatar",
          lastMessage: {
            content: "$lastMessage.content",
            timestamp: "$lastMessage.createdAt",
            sender: "$lastMessage.sender",
          },
        },
      },
    ])

    return NextResponse.json(conversations)
  } catch (error) {
    return handleRouteError(error, "Get conversations error", "Failed to get conversations")
  }
}

// Send a new message
export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const body = await readJson(req)
    const receiver = typeof body?.receiver === "string" ? body.receiver.trim() : ""
    const content = typeof body?.content === "string" ? body.content.trim() : ""

    if (!receiver || !content) return jsonError("Receiver and content are required", 400)
    if (content.length > 2000) return jsonError("Message must be 2000 characters or fewer", 400)
    if (receiver === auth.username) return jsonError("You cannot message yourself", 400)

    await connectToDatabase()

    if (!(await User.exists({ username: receiver }))) return jsonError("User not found", 404)

    const message = await Message.create({ sender: auth.username, receiver, content })
    await createNotification(auth.username, receiver, "message", "sent you a message")

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    return handleRouteError(error, "Send message error", "Failed to send message")
  }
}
```

- [ ] **Step 4: Rewrite `app/api/messages/[username]/route.ts`**

```ts
import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import { requireAuth } from "@/lib/auth"
import { handleRouteError } from "@/lib/http"
import Message from "@/models/Message"

// Get messages in a conversation with a specific user, oldest first
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { username } = await params

    await connectToDatabase()

    const messages = await Message.find({
      $or: [
        { sender: auth.username, receiver: username },
        { sender: username, receiver: auth.username },
      ],
    })
      .sort({ createdAt: 1 })
      .lean()

    return NextResponse.json(messages)
  } catch (error) {
    return handleRouteError(error, "Get messages error", "Failed to get messages")
  }
}
```

- [ ] **Step 5: Rewrite `app/api/notifications/route.ts`**

```ts
import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import { requireAuth } from "@/lib/auth"
import { handleRouteError, isValidId, jsonError, readJson } from "@/lib/http"
import Notification from "@/models/Notification"
import User from "@/models/User"

interface LeanNotification {
  _id: { toString(): string }
  sender: string
  [key: string]: unknown
}

interface LeanSender {
  username: string
  avatar?: string
}

// Get all notifications for the current user, newest first
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    await connectToDatabase()

    const notifications = (await Notification.find({ recipient: auth.username })
      .sort({ createdAt: -1 })
      .lean()) as unknown as LeanNotification[]

    const senderUsernames = [...new Set(notifications.map((notification) => notification.sender))]
    const senders = (await User.find({ username: { $in: senderUsernames } })
      .select("username avatar")
      .lean()) as unknown as LeanSender[]
    const senderMap = new Map(senders.map((sender) => [sender.username, sender]))

    return NextResponse.json(
      notifications.map((notification) => {
        const sender = senderMap.get(notification.sender)
        return {
          ...notification,
          _id: notification._id.toString(),
          user: {
            username: sender?.username || notification.sender,
            avatar: sender?.avatar || "/placeholder.svg",
          },
        }
      })
    )
  } catch (error) {
    return handleRouteError(error, "Fetch notifications error", "Failed to fetch notifications")
  }
}

// Mark the caller's notifications as read
export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const body = await readJson(req)
    const ids = body?.notificationIds
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string" && isValidId(id))) {
      return jsonError("Invalid notification IDs", 400)
    }

    await connectToDatabase()

    const result = await Notification.updateMany(
      { _id: { $in: ids }, recipient: auth.username },
      { $set: { read: true } }
    )

    return NextResponse.json({ success: true, modified: result.modifiedCount })
  } catch (error) {
    return handleRouteError(error, "Mark notifications error", "Failed to mark notifications as read")
  }
}
```

- [ ] **Step 6: Rewrite `app/api/search/route.ts`**

```ts
import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import { handleRouteError, jsonError } from "@/lib/http"
import { escapeRegex } from "@/lib/regex"
import User from "@/models/User"
import Post from "@/models/Post"

// Public search over users and posts. type is 'all', 'users' or 'posts'.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const query = (url.searchParams.get("q") || "").trim().slice(0, 100)
    const type = url.searchParams.get("type") || "all"

    if (!query) return jsonError("Search query is required", 400)

    await connectToDatabase()

    const searchRegex = new RegExp(escapeRegex(query), "i")
    const results: { users: unknown[]; posts: unknown[] } = { users: [], posts: [] }

    if (type === "all" || type === "users") {
      results.users = await User.find({ $or: [{ username: searchRegex }, { fullName: searchRegex }] })
        .select("username fullName avatar bio")
        .limit(10)
        .lean()
    }

    if (type === "all" || type === "posts") {
      results.posts = await Post.find({
        $or: [{ caption: searchRegex }, { "author.username": searchRegex }, { "comments.text": searchRegex }],
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
    }

    return NextResponse.json(results)
  } catch (error) {
    return handleRouteError(error, "Search error", "Failed to perform search")
  }
}
```

- [ ] **Step 7: Run the section and watch it pass**

Run: `npm run smoke -- social`
Expected: 28 `ok` lines, `28 checks, 0 failed`.

- [ ] **Step 8: Delete the old auth and connector files and their dependencies**

```bash
git rm -q middleware/auth.ts lib/db.ts
npm uninstall next-auth jsonwebtoken @types/jsonwebtoken
```

(`sonner` is removed in Task 8, when its last importers are rewritten.)

Run: `grep -rnE "middleware/auth|lib/db\"|next-auth|jsonwebtoken|authMiddleware|connectDB" app components contexts lib middleware.ts`
Expected: no output.

- [ ] **Step 9: Run the whole smoke suite and typecheck the server**

Run: `npm run smoke`
Expected: `109 checks, 0 failed`.

Run: `npm run typecheck 2>&1 | grep -E "^(app/api|lib|models|scripts)/"`
Expected: no output. Errors under `app/` pages, `components/` and `contexts/` are still expected.

If `app/api`, `lib` or `models` errors do appear, fix them before committing. The likely one is Mongoose's loose model typing: where the compiler rejects a property on a document, narrow with the same `as { ... }` cast style used in this task rather than `any`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Fix messages, notifications and search; remove old auth code

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Client state, route protection and config

**Files:**
- Rewrite: `lib/types.ts`, `contexts/auth-context.tsx`, `contexts/posts-context.tsx`
- Modify: `middleware.ts:6-16`, `next.config.ts`

**Interfaces:**
- Consumes: the API shapes from Tasks 2 to 5.
- Produces, from `lib/types.ts`: `NotificationSettings`, `PrivacySettings`, `UserType`, `CommentType` (now with `_id`), `PostType` (with `savedBy: string[]`, without `saved` and `content`).
- Produces, from `contexts/auth-context.tsx`: `User`, `ProfileUpdate`, and `useAuth()` returning `{ user, token, loading, isAuthenticated, login, register, logout, updateProfile(data: ProfileUpdate): Promise<void>, authFetch(input: string, init?: RequestInit): Promise<Response> }`. `authFetch` adds the Bearer header and logs out when an authenticated request answers 401.
- Produces, from `contexts/posts-context.tsx`: `NewPost`, and `usePosts()` returning `{ posts, loading, error, fetchPosts, createPost(data: NewPost): Promise<void>, likePost(id): Promise<PostType>, savePost(id): Promise<PostType>, addComment(id, text): Promise<CommentType>, deletePost(id): Promise<void> }`. Every mutation rejects with an `Error` carrying the server's message.
- Typecheck after this task: errors are expected only in `components/` and `app/**/page.tsx`.

- [ ] **Step 1: Rewrite `lib/types.ts`**

```ts
export interface NotificationSettings {
  email: boolean
  push: boolean
  followers: boolean
  comments: boolean
  likes: boolean
  mentions: boolean
  marketing: boolean
}

export interface PrivacySettings {
  isPrivate: boolean
  showActivityStatus: boolean
  allowTagging: boolean
  allowMessaging: boolean
  showPosts: boolean
  showStories: boolean
}

// A public profile, as returned by GET /api/users/[username]
export interface UserType {
  _id: string
  username: string
  fullName: string
  avatar: string
  bio: string
  website: string
  followers: number
  following: number
  isVerified: boolean
  isFollowing: boolean
}

export interface CommentType {
  _id: string
  username: string
  avatar: string
  text: string
  likes: number
  createdAt: string
}

export interface PostType {
  _id: string
  caption: string
  image?: string
  video?: string
  code?: string
  language?: string
  author: {
    username: string
    avatar: string
  }
  likes: number
  comments: CommentType[]
  likedBy: string[]
  savedBy: string[]
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2: Rewrite `contexts/auth-context.tsx`**

```tsx
"use client"

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import type { NotificationSettings, PrivacySettings } from '@/lib/types';

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  avatar: string;
  bio?: string;
  website?: string;
  notificationSettings?: NotificationSettings;
  privacySettings?: PrivacySettings;
}

export interface ProfileUpdate {
  fullName?: string;
  bio?: string;
  website?: string;
  avatar?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
  notificationSettings?: Partial<NotificationSettings>;
  privacySettings?: Partial<PrivacySettings>;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  updateProfile: (data: ProfileUpdate) => Promise<void>;
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function setTokenCookie(token: string) {
  // Read by middleware.ts to protect pages
  Cookies.set('token', token, { expires: 7, sameSite: 'lax' });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const storeUser = useCallback((nextUser: User) => {
    setUser(nextUser);
    localStorage.setItem('user', JSON.stringify(nextUser));
  }, []);

  const storeSession = useCallback((nextToken: string, nextUser: User) => {
    setToken(nextToken);
    localStorage.setItem('token', nextToken);
    setTokenCookie(nextToken);
    storeUser(nextUser);
  }, [storeUser]);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    Cookies.remove('token');
    router.push('/login');
  }, [router]);

  const authFetch = useCallback(async (input: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(input, { ...init, headers });
    // An authenticated request answering 401 means the token expired or was revoked.
    if (response.status === 401 && token) logout();
    return response;
  }, [token, logout]);

  // Restore the stored session, then refresh the user from the server.
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = readStoredUser();

    if (!storedToken || !storedUser) {
      setLoading(false);
      return;
    }

    setToken(storedToken);
    setUser(storedUser);
    setTokenCookie(storedToken);
    setLoading(false);

    let cancelled = false;
    fetch('/api/users/profile', { headers: { Authorization: `Bearer ${storedToken}` } })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) {
          logout();
        } else if (response.ok) {
          const fresh = (await response.json()) as User;
          if (!cancelled) storeUser(fresh);
        }
      })
      .catch(() => {
        // Offline or server down: keep the stored session.
      });

    return () => {
      cancelled = true;
    };
  }, [logout, storeUser]);

  const authenticate = async (path: string, body: Record<string, string>, fallback: string) => {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.token) {
      throw new Error(data?.error || fallback);
    }
    storeSession(data.token, data.user);
    router.push('/');
  };

  const login = (email: string, password: string) =>
    authenticate('/api/auth/login', { email, password }, 'Login failed');

  const register = (username: string, email: string, password: string, fullName: string) =>
    authenticate('/api/auth/register', { username, email, password, fullName }, 'Registration failed');

  const updateProfile = async (data: ProfileUpdate) => {
    const response = await authFetch('/api/users/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const updated = await response.json().catch(() => null);
    if (!response.ok || !updated) {
      throw new Error(updated?.error || 'Failed to update profile');
    }
    storeUser(updated as User);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
        updateProfile,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

- [ ] **Step 3: Rewrite `contexts/posts-context.tsx`**

```tsx
"use client"

import { createContext, useCallback, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './auth-context';
import type { PostType, CommentType } from "@/lib/types"

export interface NewPost {
  caption: string;
  image?: string;
  video?: string;
  code?: string;
  language?: string;
}

interface PostsContextType {
  posts: PostType[];
  loading: boolean;
  error: string | null;
  fetchPosts: () => Promise<void>;
  createPost: (data: NewPost) => Promise<void>;
  likePost: (postId: string) => Promise<PostType>;
  savePost: (postId: string) => Promise<PostType>;
  addComment: (postId: string, text: string) => Promise<CommentType>;
  deletePost: (postId: string) => Promise<void>;
}

const PostsContext = createContext<PostsContextType | undefined>(undefined);

// Parses a successful response, or throws an Error with the server's message.
async function parseOrThrow<T>(response: Response, fallback: string): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new Error(data?.error || fallback);
  }
  return data as T;
}

export function PostsProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<PostType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { authFetch } = useAuth();

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/posts');
      setPosts(await parseOrThrow<PostType[]>(response, 'Failed to fetch posts'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch posts');
    } finally {
      setLoading(false);
    }
  }, []);

  const replacePost = (updated: PostType) => {
    setPosts(prevPosts => prevPosts.map(post => (post._id === updated._id ? updated : post)));
  };

  const postJson = (path: string, body?: unknown) =>
    authFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const createPost = async (data: NewPost) => {
    const newPost = await parseOrThrow<PostType>(await postJson('/api/posts', data), 'Failed to create post');
    setPosts(prevPosts => [newPost, ...prevPosts]);
  };

  const likePost = async (postId: string) => {
    const updated = await parseOrThrow<PostType>(await postJson(`/api/posts/${postId}/like`), 'Failed to update like');
    replacePost(updated);
    return updated;
  };

  const savePost = async (postId: string) => {
    const updated = await parseOrThrow<PostType>(await postJson(`/api/posts/${postId}/save`), 'Failed to update save');
    replacePost(updated);
    return updated;
  };

  const addComment = async (postId: string, text: string) => {
    const newComment = await parseOrThrow<CommentType>(
      await postJson(`/api/posts/${postId}/comments`, { text }),
      'Failed to add comment'
    );
    setPosts(prevPosts =>
      prevPosts.map(post =>
        post._id === postId ? { ...post, comments: [...post.comments, newComment] } : post
      )
    );
    return newComment;
  };

  const deletePost = async (postId: string) => {
    const response = await authFetch(`/api/posts/${postId}`, { method: 'DELETE' });
    await parseOrThrow<{ message: string }>(response, 'Failed to delete post');
    setPosts(prevPosts => prevPosts.filter(post => post._id !== postId));
  };

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  return (
    <PostsContext.Provider
      value={{
        posts,
        loading,
        error,
        fetchPosts,
        createPost,
        likePost,
        savePost,
        addComment,
        deletePost,
      }}
    >
      {children}
    </PostsContext.Provider>
  );
}

export function usePosts() {
  const context = useContext(PostsContext);
  if (context === undefined) {
    throw new Error('usePosts must be used within a PostsProvider');
  }
  return context;
}
```

- [ ] **Step 4: Point `middleware.ts` at the real routes**

Replace the two path lists at the top of `middleware.ts`:

```ts
// Add paths that require authentication
const protectedPaths = [
  '/settings',
  '/profile',
  '/direct',
  '/notifications',
  '/create'
]

// Add paths that should redirect to home if user is already authenticated
const authPaths = ['/login', '/register']
```

Leave the rest of the file unchanged.

- [ ] **Step 5: Remove the image host allowlist**

Replace the whole of `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 6: Verify the server still passes and the contexts compile**

Run: `npm run smoke`
Expected: `109 checks, 0 failed`.

Run: `npm run typecheck 2>&1 | grep -E "^(contexts|lib|app/api|models|middleware)"`
Expected: no output.

- [ ] **Step 7: Verify route protection by hand**

With the dev server running and no `token` cookie:

Run: `for p in /settings /direct /notifications /create /profile/x /explore /; do printf "%s -> " "$p"; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3000$p"; done`
Expected: the first five lines show `307` and a URL starting `http://localhost:3000/login?from=`. `/explore` and `/` show `200` with no redirect URL.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Rework client auth and posts state around authFetch

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Post, post detail, explore and profile UI

**Files:**
- Rewrite: `components/post.tsx`, `components/post-detail.tsx`, `components/profile.tsx`, `components/profile-post.tsx`, `components/explore-post.tsx`, `components/explore-page.tsx`
- Modify: `app/p/[id]/page.tsx`, `app/profile/[username]/page.tsx`, `components/create-post-form.tsx`

**Interfaces:**
- Consumes: `useAuth()` and `usePosts()` as defined in Task 6; `PostType`, `CommentType`, `UserType` from `lib/types.ts`.
- Produces: `<Post post={PostType} />`, `<PostDetail id={string} />` (it now fetches its own post), `<Profile username={string} />`, `<ProfilePost post />`, `<ExplorePost post />`.
- Typecheck after this task: errors are expected only in `components/account-settings.tsx`, `components/notification-settings.tsx`, `components/privacy-settings.tsx`, `components/edit-profile-form.tsx`, `components/search.tsx`, `components/search-page.tsx`.

- [ ] **Step 1: Rewrite `components/post.tsx`**

```tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Heart, MessageCircle, Bookmark, MoreHorizontal, Code, Image as ImageIcon } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { usePosts } from "@/contexts/posts-context"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CodeBlock } from "@/components/code-block"
import { VideoPlayer } from "@/components/video-player"
import type { PostType } from "@/lib/types"
import toast from "react-hot-toast"

interface PostProps {
  post: PostType
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function Post({ post }: PostProps) {
  const [comment, setComment] = useState("")
  const [showComments, setShowComments] = useState(false)
  const { likePost, savePost, addComment, deletePost } = usePosts()
  const { user } = useAuth()
  const router = useRouter()

  const isAuthor = user?.username === post.author.username
  const isLiked = !!user && (post.likedBy || []).includes(user.username)
  const isSaved = !!user && (post.savedBy || []).includes(user.username)
  const comments = post.comments || []

  // Signed-out visitors are sent to log in instead of getting a failed request.
  const requireUser = () => {
    if (user) return true
    router.push("/login")
    return false
  }

  const handleLike = async () => {
    if (!requireUser()) return
    try {
      await likePost(post._id)
    } catch (error) {
      toast.error(messageOf(error, "Failed to update like"))
    }
  }

  const handleSave = async () => {
    if (!requireUser()) return
    try {
      await savePost(post._id)
      toast.success(isSaved ? "Post unsaved" : "Post saved")
    } catch (error) {
      toast.error(messageOf(error, "Failed to update save"))
    }
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) return

    try {
      await addComment(post._id, comment)
      setComment("")
    } catch (error) {
      toast.error(messageOf(error, "Failed to add comment"))
    }
  }

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this post?")) return
    try {
      await deletePost(post._id)
      toast.success("Post deleted successfully")
    } catch (error) {
      toast.error(messageOf(error, "Failed to delete post"))
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md overflow-hidden">
      {/* Post Header */}
      <div className="p-4 flex items-center justify-between">
        <Link href={`/profile/${post.author.username}`} className="flex items-center">
          <Avatar className="h-8 w-8">
            <AvatarImage src={post.author.avatar} alt={post.author.username} />
            <AvatarFallback>{post.author.username[0].toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="ml-3 font-medium">{post.author.username}</span>
        </Link>
        {isAuthor && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-5 w-5" />
                <span className="sr-only">Post options</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Post Options</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Button variant="destructive" className="w-full" onClick={handleDelete}>
                  Delete Post
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Post Content */}
      <div className="relative">
        {post.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, any host
          <img src={post.image} alt={post.caption} className="w-full object-cover" />
        ) : post.video ? (
          <VideoPlayer url={post.video} />
        ) : post.code ? (
          <div className="bg-gray-100 dark:bg-gray-800 p-4 overflow-x-auto">
            <div className="flex items-center mb-2">
              <Code className="h-4 w-4 mr-2" />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {post.language || "javascript"}
              </span>
            </div>
            <CodeBlock code={post.code} language={post.language || "javascript"} />
          </div>
        ) : (
          <div className="h-64 bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
            <ImageIcon className="h-12 w-12 text-gray-400" />
          </div>
        )}
      </div>

      {/* Post Actions */}
      <div className="p-4">
        <TooltipProvider>
          <div className="flex items-center space-x-4 mb-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLike}
                  className={`hover:bg-transparent ${isLiked ? "text-red-500 hover:text-red-600" : "text-gray-500 hover:text-gray-600"}`}
                >
                  <Heart className={`h-6 w-6 ${isLiked ? "fill-current" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isLiked ? "Unlike" : "Like"}</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setShowComments(!showComments)}>
                  <MessageCircle className="h-6 w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Comment</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSave}
                  className={isSaved ? "text-blue-500" : ""}
                >
                  <Bookmark className={`h-6 w-6 ${isSaved ? "fill-current" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isSaved ? "Unsave" : "Save"}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        <p className="font-medium">{post.likes} likes</p>
        <p className="mt-1">
          <Link href={`/profile/${post.author.username}`} className="font-medium mr-2">
            {post.author.username}
          </Link>
          {post.caption}
        </p>
        <Link href={`/p/${post._id}`} className="block text-xs text-gray-500 dark:text-gray-400 mt-1 hover:underline">
          {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
        </Link>

        {/* Comments Section */}
        {showComments && (
          <div className="mt-4">
            <Separator className="my-2" />

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {comments.map((item) => (
                <div key={item._id} className="flex items-start">
                  <Avatar className="h-6 w-6 mr-2">
                    <AvatarImage src={item.avatar} alt={item.username} />
                    <AvatarFallback>{item.username[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm">
                      <span className="font-medium mr-2">{item.username}</span>
                      {item.text}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {user ? (
              <form onSubmit={handleComment} className="mt-4">
                <div className="flex items-center space-x-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.avatar} alt={user.username} />
                    <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <Textarea
                      placeholder="Add a comment..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="min-h-[80px]"
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-2">
                  <Button type="submit" disabled={!comment.trim()}>
                    Post
                  </Button>
                </div>
              </form>
            ) : (
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                <Link href="/login" className="text-blue-500 hover:underline">Log in</Link> to comment.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `components/post-detail.tsx`**

```tsx
"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Heart, MessageCircle, Bookmark, Code, Send } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { CodeBlock } from "@/components/code-block"
import { VideoPlayer } from "./video-player"
import type { PostType } from "@/lib/types"
import { usePosts } from "@/contexts/posts-context"
import { useAuth } from "@/contexts/auth-context"
import { formatDistanceToNow } from "date-fns"
import toast from "react-hot-toast"

interface PostDetailProps {
  id: string
}

type Status = "loading" | "ready" | "missing" | "error"

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function PostDetail({ id }: PostDetailProps) {
  const { user } = useAuth()
  const { likePost, savePost, addComment } = usePosts()
  const router = useRouter()
  const [post, setPost] = useState<PostType | null>(null)
  const [status, setStatus] = useState<Status>("loading")
  const [similarPosts, setSimilarPosts] = useState<PostType[]>([])
  const [comment, setComment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setStatus("loading")
      try {
        const response = await fetch(`/api/posts/${id}`)
        if (cancelled) return
        if (response.status === 404) {
          setStatus("missing")
          return
        }
        if (!response.ok) {
          setStatus("error")
          return
        }
        const data = (await response.json()) as PostType
        if (cancelled) return
        setPost(data)
        setStatus("ready")

        const similar = await fetch(`/api/posts/similar/${id}`)
        if (!cancelled && similar.ok) setSimilarPosts(await similar.json())
      } catch {
        if (!cancelled) setStatus("error")
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id])

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-6xl p-4">
        <div className="aspect-video animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (status === "missing" || status === "error" || !post) {
    return (
      <div className="mx-auto max-w-6xl py-10 text-center">
        <p className="text-muted-foreground">
          {status === "missing" ? "This post does not exist or was deleted." : "Could not load this post."}
        </p>
        <Link href="/" className="mt-4 inline-block text-blue-500 hover:underline">
          Back to feed
        </Link>
      </div>
    )
  }

  const isLiked = !!user && (post.likedBy || []).includes(user.username)
  const isSaved = !!user && (post.savedBy || []).includes(user.username)
  const comments = post.comments || []

  const requireUser = () => {
    if (user) return true
    router.push("/login")
    return false
  }

  const handleLike = async () => {
    if (!requireUser()) return
    try {
      setPost(await likePost(post._id))
    } catch (error) {
      toast.error(messageOf(error, "Failed to update like"))
    }
  }

  const handleSave = async () => {
    if (!requireUser()) return
    try {
      setPost(await savePost(post._id))
    } catch (error) {
      toast.error(messageOf(error, "Failed to update save"))
    }
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim() || !user) return

    setIsSubmitting(true)
    try {
      const newComment = await addComment(post._id, comment)
      setPost((current) => (current ? { ...current, comments: [...(current.comments || []), newComment] } : current))
      setComment("")
    } catch (error) {
      toast.error(messageOf(error, "Failed to add comment"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto p-4">
      <div className="space-y-4">
        <div className="bg-card text-card-foreground rounded-lg shadow-md overflow-hidden">
          {post.image && (
            // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, any host
            <img src={post.image} alt={post.caption || "Post image"} className="w-full object-cover" />
          )}
          {post.video && <VideoPlayer url={post.video} className="w-full" />}
          {post.code && <CodeBlock code={post.code} language={post.language || "javascript"} />}

          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleLike}
                  className={`flex items-center gap-1 ${isLiked ? "text-red-500 hover:text-red-600" : "text-gray-500 hover:text-gray-600"}`}
                  aria-label={isLiked ? "Unlike post" : "Like post"}
                >
                  <Heart className={`h-6 w-6 ${isLiked ? "fill-current" : ""}`} />
                  <span>{post.likes}</span>
                </button>
                <span className="flex items-center gap-1 text-gray-500">
                  <MessageCircle className="h-6 w-6" />
                  <span>{comments.length}</span>
                </span>
              </div>
              <button
                onClick={handleSave}
                className={isSaved ? "text-blue-500" : "text-gray-500"}
                aria-label={isSaved ? "Unsave post" : "Save post"}
              >
                <Bookmark className={`h-6 w-6 ${isSaved ? "fill-current" : ""}`} />
              </button>
            </div>

            <Link href={`/profile/${post.author.username}`} className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={post.author.avatar} alt={post.author.username} />
                <AvatarFallback>{post.author.username[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="font-medium">{post.author.username}</span>
            </Link>

            {post.caption && <p className="whitespace-pre-wrap">{post.caption}</p>}
            <p className="text-sm text-muted-foreground">
              {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
            </p>

            <div className="space-y-4">
              {comments.map((item) => (
                <div key={item._id} className="flex gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={item.avatar} alt={item.username} />
                    <AvatarFallback>{item.username[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p>
                      <span className="font-medium mr-2">{item.username}</span>
                      {item.text}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {user ? (
              <form onSubmit={handleComment} className="flex gap-2">
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 rounded-full border border-input bg-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isSubmitting}
                />
                <button
                  type="submit"
                  disabled={!comment.trim() || isSubmitting}
                  className="rounded-full bg-blue-500 p-2 text-white disabled:opacity-50"
                  aria-label="Post comment"
                >
                  <Send className="h-5 w-5" />
                </button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                <Link href="/login" className="text-blue-500 hover:underline">Log in</Link> to comment.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Similar Posts</h2>
        {similarPosts.length === 0 ? (
          <p className="text-muted-foreground">No similar posts yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {similarPosts.map((similarPost) => (
              <Link
                key={similarPost._id}
                href={`/p/${similarPost._id}`}
                className="relative block aspect-square overflow-hidden rounded-lg bg-muted"
              >
                {similarPost.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, any host
                  <img src={similarPost.image} alt={similarPost.caption} className="h-full w-full object-cover" />
                ) : similarPost.code ? (
                  <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-50">
                    <Code className="h-8 w-8" />
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-2 text-center text-sm text-muted-foreground">
                    {similarPost.caption}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Await `params` in the two dynamic pages**

Replace the whole of `app/p/[id]/page.tsx`:

```tsx
import { MainLayout } from "@/components/main-layout"
import { PostDetail } from "@/components/post-detail"

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <MainLayout>
      <PostDetail id={id} />
    </MainLayout>
  )
}
```

Replace the whole of `app/profile/[username]/page.tsx`:

```tsx
import { MainLayout } from "@/components/main-layout"
import { Profile } from "@/components/profile"

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params

  return (
    <MainLayout>
      <Profile username={username} />
    </MainLayout>
  )
}
```

- [ ] **Step 4: Rewrite `components/profile-post.tsx`**

```tsx
import Link from "next/link"
import { Heart, MessageCircle, Code, Video } from "lucide-react"
import type { PostType } from "@/lib/types"

interface ProfilePostProps {
  post: PostType
}

export function ProfilePost({ post }: ProfilePostProps) {
  return (
    <Link href={`/p/${post._id}`} className="group relative aspect-square overflow-hidden bg-muted">
      {post.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, any host
        <img
          src={post.image}
          alt="Post thumbnail"
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-50">
          {post.video ? <Video className="h-8 w-8" /> : <Code className="h-8 w-8" />}
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="flex items-center gap-4 text-white">
          <div className="flex items-center gap-1">
            <Heart className="h-5 w-5 fill-white" />
            <span className="text-sm font-medium">{post.likes || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageCircle className="h-5 w-5 fill-white" />
            <span className="text-sm font-medium">{(post.comments || []).length}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 5: Rewrite `components/explore-post.tsx`**

```tsx
import Link from "next/link"
import { Heart, MessageCircle, Code, Video } from "lucide-react"
import type { PostType } from "@/lib/types"

interface ExplorePostProps {
  post: PostType
}

export function ExplorePost({ post }: ExplorePostProps) {
  return (
    <Link href={`/p/${post._id}`} className="group relative aspect-[3/4] overflow-hidden bg-muted">
      {post.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, any host
        <img
          src={post.image}
          alt="Post thumbnail"
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-50">
          {post.video ? <Video className="h-8 w-8" /> : <Code className="h-8 w-8" />}
        </div>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="mb-2 text-white font-medium">{post.author.username}</span>
        <div className="flex items-center gap-4 text-white">
          <div className="flex items-center gap-1">
            <Heart className="h-5 w-5 fill-white" />
            <span className="text-sm font-medium">{post.likes || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageCircle className="h-5 w-5 fill-white" />
            <span className="text-sm font-medium">{(post.comments || []).length}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 6: Stop the explore grid reshuffling on every render**

In `components/explore-page.tsx`, change the React import and the shuffle. Replace the first lines:

```tsx
"use client"

import { useMemo } from "react"
import { usePosts } from "@/contexts/posts-context"
import { ExplorePost } from "@/components/explore-post"

export function ExplorePage() {
  const { posts, loading, error } = usePosts()

  // Shuffle once per set of posts, so liking a post does not reorder the grid.
  const postIds = posts.map((post) => post._id).join(",")
  const order = useMemo(
    () => postIds.split(",").filter(Boolean).sort(() => Math.random() - 0.5),
    [postIds]
  )
  const shuffledPosts = order
    .map((id) => posts.find((post) => post._id === id))
    .filter((post): post is (typeof posts)[number] => Boolean(post))
```

Then delete the two later lines that the block above replaces:

```tsx
  // Shuffle posts to show different content on each visit
  const shuffledPosts = [...posts].sort(() => Math.random() - 0.5)
```

The `if (loading)`, `if (error)`, `if (posts.length === 0)` blocks and the final `return` stay as they are, below the new lines.

- [ ] **Step 7: Rewrite `components/profile.tsx`**

```tsx
"use client"
import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Bookmark, Grid, Settings } from "lucide-react"
import { usePosts } from "@/contexts/posts-context"
import { useAuth } from "@/contexts/auth-context"
import { ProfilePost } from "@/components/profile-post"
import { useEffect, useState } from "react"
import type { UserType } from "@/lib/types"
import { toast } from "react-hot-toast"
import { useRouter } from "next/navigation"

interface ProfileProps {
  username: string
}

export function Profile({ username }: ProfileProps) {
  const { user: currentUser, authFetch, loading: authLoading } = useAuth()
  const { posts } = usePosts()
  const router = useRouter()
  const [user, setUser] = useState<UserType | null>(null)
  const [loading, setLoading] = useState(true)
  const [followLoading, setFollowLoading] = useState(false)

  useEffect(() => {
    // Wait for the stored session, so the request carries the token and
    // the response's isFollowing is about this viewer.
    if (authLoading) return
    let cancelled = false

    const fetchUserProfile = async () => {
      try {
        const response = await authFetch(`/api/users/${username}`)
        if (cancelled) return
        setUser(response.ok ? await response.json() : null)
      } catch (error) {
        console.error('Error fetching user profile:', error)
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchUserProfile()
    return () => {
      cancelled = true
    }
  }, [username, authFetch, authLoading])

  const isOwnProfile = currentUser?.username === username
  const userPosts = posts.filter((post) => post.author.username === username)
  const savedPosts = currentUser
    ? posts.filter((post) => (post.savedBy || []).includes(currentUser.username))
    : []

  const handleFollow = async () => {
    if (!currentUser) {
      router.push('/login')
      return
    }
    if (!user) return

    setFollowLoading(true)
    try {
      const response = await authFetch(`/api/users/${username}/follow`, { method: 'POST' })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data) throw new Error(data?.error || 'Failed to follow/unfollow user')

      setUser(prev => prev ? { ...prev, isFollowing: data.following, followers: data.followers } : null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to follow/unfollow user')
    } finally {
      setFollowLoading(false)
    }
  }

  const handleMessage = () => {
    router.push(`/direct?user=${username}`)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="animate-pulse">
          <div className="mb-8 flex flex-col items-center gap-6 md:flex-row md:items-start md:gap-10">
            <div className="h-24 w-24 rounded-full bg-gray-200 dark:bg-gray-800 md:h-36 md:w-36" />
            <div className="flex-1 space-y-4">
              <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl text-center py-10">
        <p className="text-red-500">User not found</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex flex-col items-center gap-6 md:flex-row md:items-start md:gap-10">
        <div className="relative h-24 w-24 overflow-hidden rounded-full md:h-36 md:w-36">
          {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, any host */}
          <img
            src={user.avatar || "/placeholder.svg"}
            alt={user.username}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="flex flex-1 flex-col items-center text-center md:items-start md:text-left">
          <div className="mb-4 flex flex-col items-center gap-4 md:flex-row">
            <h1 className="text-2xl font-bold">{user.username}</h1>
            <div className="flex gap-2">
              {!isOwnProfile && (
                <>
                  <Button
                    onClick={handleFollow}
                    disabled={followLoading}
                    variant={user.isFollowing ? "outline" : "default"}
                  >
                    {user.isFollowing ? "Unfollow" : "Follow"}
                  </Button>
                  <Button variant="outline" onClick={handleMessage}>Message</Button>
                </>
              )}
              {isOwnProfile && (
                <Button variant="ghost" size="icon" asChild>
                  <Link href="/settings">
                    <Settings className="h-4 w-4" />
                    <span className="sr-only">Settings</span>
                  </Link>
                </Button>
              )}
            </div>
          </div>
          <div className="mb-4 flex gap-6">
            <div className="text-center">
              <span className="font-bold">{userPosts.length}</span>{" "}
              <span className="text-muted-foreground">posts</span>
            </div>
            <div className="text-center">
              <span className="font-bold">{user.followers || 0}</span>{" "}
              <span className="text-muted-foreground">followers</span>
            </div>
            <div className="text-center">
              <span className="font-bold">{user.following || 0}</span>{" "}
              <span className="text-muted-foreground">following</span>
            </div>
          </div>
          <div>
            <p className="font-medium">{user.fullName}</p>
            <p className="whitespace-pre-wrap">{user.bio}</p>
            {user.website && (
              <a
                href={user.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {user.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
        </div>
      </div>
      <Tabs defaultValue="posts">
        <TabsList className={`grid w-full ${isOwnProfile ? "grid-cols-2" : "grid-cols-1"}`}>
          <TabsTrigger value="posts" className="flex items-center gap-2">
            <Grid className="h-4 w-4" />
            <span className="hidden sm:inline">Posts</span>
          </TabsTrigger>
          {isOwnProfile && (
            <TabsTrigger value="saved" className="flex items-center gap-2">
              <Bookmark className="h-4 w-4" />
              <span className="hidden sm:inline">Saved</span>
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="posts" className="mt-6">
          {userPosts.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">No posts yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1 md:gap-4">
              {userPosts.map((post) => (
                <ProfilePost key={post._id} post={post} />
              ))}
            </div>
          )}
        </TabsContent>
        {isOwnProfile && (
          <TabsContent value="saved" className="mt-6">
            {savedPosts.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground">No saved posts yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1 md:gap-4">
                {savedPosts.map((post) => (
                  <ProfilePost key={post._id} post={post} />
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 8: Stop the create form toasting every error twice**

In `components/create-post-form.tsx`, the `catch` block of `handleSubmit` toasts an error that `toast.promise` has already shown. Replace that block:

```tsx
    } catch (err) {
      // toast.promise above has already shown the error toast.
      setError(err instanceof Error ? err.message : "Failed to create post")
    } finally {
```

- [ ] **Step 9: Typecheck the files from this task**

Run: `npm run typecheck 2>&1 | grep -E "components/(post|post-detail|profile|profile-post|explore-post|explore-page|create-post-form|feed)\.tsx|app/(p|profile)/"`
Expected: no output.

- [ ] **Step 10: Check the flows in the browser**

Open `http://localhost:3000`, register a throwaway account (use a `smoke_manual_` username so it is easy to find later) and check each of these:

1. Create an image post with `https://picsum.photos/600` and a code post. Both appear at the top of the feed.
2. Like a post: the heart fills and the count goes to 1. Click again: back to 0.
3. Save a post: the bookmark fills. Open your profile: the post is under Saved. Unsave it: it leaves the Saved tab.
4. Comment on a post: the comment appears with your username and "less than a minute ago".
5. Click a post's timestamp: `/p/<id>` shows the post, its comments and Similar Posts. Like and comment from there.
6. Visit `/p/not-an-id`: "This post does not exist or was deleted."
7. Explore shows the grid; liking a post elsewhere does not reorder it.
8. Delete one of your posts from the "..." menu: it disappears and a success toast shows.
9. Log out. On the feed, click the heart on a post: you land on `/login`.

Expected: all nine behave as described, with no error overlay and no red errors in the browser console.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Fix post, post detail, explore and profile UI

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Settings, navigation, search, messages and notifications UI

**Files:**
- Rewrite: `components/edit-profile-form.tsx`, `components/account-settings.tsx`, `components/notification-settings.tsx`, `components/privacy-settings.tsx`, `app/search/page.tsx`, `app/direct/page.tsx`
- Modify: `components/navbar.tsx:29-37`, `components/search.tsx`, `components/search-page.tsx`, `components/direct-messages.tsx`, `components/notifications-page.tsx`, `package.json` (remove `sonner`)

**Interfaces:**
- Consumes: `useAuth()` from Task 6 (`user.notificationSettings`, `user.privacySettings`, `updateProfile`, `authFetch`); `NotificationSettings`, `PrivacySettings` from `lib/types.ts`; the search and messages API shapes from Task 5.
- Produces: no new exports. After this task `npm run typecheck` is clean.

- [ ] **Step 1: Rewrite `components/edit-profile-form.tsx`**

```tsx
"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/contexts/auth-context"
import toast from "react-hot-toast"

export function EditProfileForm() {
  const { user, updateProfile } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({ fullName: "", website: "", bio: "", avatar: "" })

  const fullName = user?.fullName || ""
  const website = user?.website || ""
  const bio = user?.bio || ""
  // The placeholder is the "no avatar" state, so it is shown as an empty field.
  const avatar = user?.avatar && user.avatar !== "/placeholder.svg" ? user.avatar : ""

  // Load saved values, including ones that arrive after the session refresh.
  useEffect(() => {
    setFormData({ fullName, website, bio, avatar })
  }, [fullName, website, bio, avatar])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      await updateProfile(formData)
      toast.success("Profile updated successfully!")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update profile")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!user) {
    return null
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
          <CardDescription>Update your profile information</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-24 w-24 overflow-hidden rounded-full">
                {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, any host */}
                <img
                  src={formData.avatar || "/placeholder.svg"}
                  alt={user.username}
                  className="h-full w-full object-cover"
                />
              </div>
              <p className="text-sm font-medium">{user.username}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="avatar">Profile picture URL</Label>
              <Input
                id="avatar"
                name="avatar"
                type="url"
                value={formData.avatar}
                onChange={handleChange}
                placeholder="https://example.com/avatar.jpg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Name</Label>
              <Input id="fullName" name="fullName" value={formData.fullName} onChange={handleChange} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={user.username} disabled />
              <p className="text-xs text-muted-foreground">Usernames cannot be changed.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                name="website"
                type="url"
                value={formData.website}
                onChange={handleChange}
                placeholder="https://example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" name="bio" value={formData.bio} onChange={handleChange} rows={4} maxLength={500} />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Saving..." : "Save Profile"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `components/account-settings.tsx`**

```tsx
"use client"

import { useEffect, useState } from "react"
import { useAuth, type ProfileUpdate } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import toast from "react-hot-toast"

export function AccountSettings() {
  const { user, updateProfile } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  const savedEmail = user?.email || ""
  useEffect(() => {
    setFormData((prev) => ({ ...prev, email: savedEmail }))
  }, [savedEmail])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const update: ProfileUpdate = {}
    if (formData.email !== savedEmail) update.email = formData.email

    if (formData.newPassword) {
      if (formData.newPassword !== formData.confirmPassword) {
        toast.error("New passwords don't match")
        return
      }
      if (!formData.currentPassword) {
        toast.error("Current password is required")
        return
      }
      update.currentPassword = formData.currentPassword
      update.newPassword = formData.newPassword
    }

    if (Object.keys(update).length === 0) {
      toast("Nothing to update")
      return
    }

    setIsLoading(true)
    try {
      await updateProfile(update)
      toast.success("Account settings updated")
      setFormData((prev) => ({ ...prev, currentPassword: "", newPassword: "", confirmPassword: "" }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update account settings")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
        </div>

        <div>
          <Label htmlFor="currentPassword">Current Password</Label>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={formData.currentPassword}
            onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="newPassword">New Password</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={formData.newPassword}
            onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="confirmPassword">Confirm New Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          />
        </div>
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  )
}
```

- [ ] **Step 3: Rewrite `components/notification-settings.tsx`**

```tsx
"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { NotificationSettings as Settings } from "@/lib/types"
import toast from "react-hot-toast"

const DEFAULTS: Settings = {
  email: true,
  push: true,
  followers: true,
  comments: true,
  likes: true,
  mentions: true,
  marketing: false,
}

const OPTIONS: Array<{ key: keyof Settings; label: string }> = [
  { key: "email", label: "Email Notifications" },
  { key: "push", label: "Push Notifications" },
  { key: "followers", label: "New Follower Notifications" },
  { key: "comments", label: "New Comment Notifications" },
  { key: "likes", label: "New Like Notifications" },
  { key: "mentions", label: "New Mention Notifications" },
  { key: "marketing", label: "Marketing Emails" },
]

export function NotificationSettings() {
  const { user, updateProfile } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULTS)

  // Load the saved values once they arrive from the server.
  const saved = user?.notificationSettings
  useEffect(() => {
    if (saved) setSettings({ ...DEFAULTS, ...saved })
  }, [saved])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await updateProfile({ notificationSettings: settings })
      toast.success("Notification settings updated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update notification settings")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        {OPTIONS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <Label htmlFor={`notification-${key}`}>{label}</Label>
            <Switch
              id={`notification-${key}`}
              checked={settings[key]}
              onCheckedChange={(checked) => setSettings({ ...settings, [key]: checked })}
            />
          </div>
        ))}
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  )
}
```

- [ ] **Step 4: Rewrite `components/privacy-settings.tsx`**

```tsx
"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { PrivacySettings as Settings } from "@/lib/types"
import toast from "react-hot-toast"

const DEFAULTS: Settings = {
  isPrivate: false,
  showActivityStatus: true,
  allowTagging: true,
  allowMessaging: true,
  showPosts: true,
  showStories: true,
}

const OPTIONS: Array<{ key: keyof Settings; label: string }> = [
  { key: "isPrivate", label: "Private Account" },
  { key: "showActivityStatus", label: "Show Activity Status" },
  { key: "allowTagging", label: "Allow Tagging" },
  { key: "allowMessaging", label: "Allow Messages" },
  { key: "showPosts", label: "Show Posts" },
  { key: "showStories", label: "Show Stories" },
]

export function PrivacySettings() {
  const { user, updateProfile } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULTS)

  // Load the saved values once they arrive from the server.
  const saved = user?.privacySettings
  useEffect(() => {
    if (saved) setSettings({ ...DEFAULTS, ...saved })
  }, [saved])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await updateProfile({ privacySettings: settings })
      toast.success("Privacy settings updated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update privacy settings")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="text-sm text-muted-foreground">
        These preferences are saved to your account. They are not enforced yet.
      </p>
      <div className="space-y-4">
        {OPTIONS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <Label htmlFor={`privacy-${key}`}>{label}</Label>
            <Switch
              id={`privacy-${key}`}
              checked={settings[key]}
              onCheckedChange={(checked) => setSettings({ ...settings, [key]: checked })}
            />
          </div>
        ))}
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  )
}
```

- [ ] **Step 5: Remove `sonner`**

Run: `grep -rn "sonner" app components contexts lib`
Expected: no output.

Run: `npm uninstall sonner`

- [ ] **Step 6: Link the navbar icons**

In `components/navbar.tsx`, replace the two icon buttons at the start of the `<nav>`:

```tsx
            <Button variant="ghost" size="icon" asChild>
              <Link href="/create">
                <PlusSquare className="h-5 w-5" />
                <span className="sr-only">Create</span>
              </Link>
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link href="/notifications">
                <Heart className="h-5 w-5" />
                <span className="sr-only">Notifications</span>
              </Link>
            </Button>
```

In the same file, replace the avatar `src` so it has no query string:

```tsx
                <AvatarImage src={user?.avatar || "/placeholder.svg"} alt={user?.username || "User"} />
```

- [ ] **Step 7: Fix the navbar search box**

In `components/search.tsx`:

Add `"use client"` and a blank line as the first two lines of the file.

Replace the `posts` part of the `SearchResult` interface:

```tsx
  posts: Array<{
    _id: string
    caption: string
    image?: string
    author: {
      username: string
      avatar: string
    }
    createdAt: string
  }>
```

Search is public now, so drop the token. Delete the line `import { useAuth } from "@/contexts/auth-context"` and the line `const { token } = useAuth()`. Replace the fetch call and the effect's dependency list:

```tsx
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=${activeTab}`)
```

```tsx
  }, [query, activeTab])
```

Replace both occurrences of `{post.content}` with `{post.caption}`.

- [ ] **Step 8: Fix the search page**

In `components/search-page.tsx`:

Replace the `posts` part of the `SearchResult` interface:

```tsx
  posts: Array<{
    _id: string
    caption: string
    image?: string
    author: {
      username: string
      avatar: string
    }
    createdAt: string
  }>
```

Delete the line `import { useAuth } from "@/contexts/auth-context"` and the line `const { token } = useAuth()`. Replace both occurrences of `{post.content}` with `{post.caption}`. Replace the fetch call and the effect's dependency list:

```tsx
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=${activeTab}`)
```

```tsx
  }, [query, activeTab])
```

`useSearchParams` needs a Suspense boundary to build. Replace the whole of `app/search/page.tsx`:

```tsx
import { Suspense } from "react"
import { SearchPage } from "@/components/search-page"

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SearchPage />
    </Suspense>
  )
}
```

- [ ] **Step 9: Move direct messages to `authFetch`**

`DirectMessages` also uses `useSearchParams`. Replace the whole of `app/direct/page.tsx`:

```tsx
import { Suspense } from "react"
import { MainLayout } from "@/components/main-layout"
import { DirectMessages } from "@/components/direct-messages"

export default function DirectMessagesPage() {
  return (
    <MainLayout>
      <Suspense fallback={null}>
        <DirectMessages />
      </Suspense>
    </MainLayout>
  )
}
```

In `components/direct-messages.tsx`:

Replace `const { user, token } = useAuth()` with:

```tsx
  const { user, token, authFetch } = useAuth()
```

Replace the conversations request:

```tsx
        const response = await authFetch("/api/messages")
```

Replace the thread request:

```tsx
        const response = await authFetch(`/api/messages/${activeChat}`)
```

Replace the user lookup request:

```tsx
          const response = await authFetch(`/api/users/${userParam}`)
```

Replace the send request and its error handling, from `const response = await fetch("/api/messages", {` through `if (!response.ok) throw new Error("Failed to send message")` and the line that reads the body:

```tsx
      const response = await authFetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiver: activeChat,
          content: message,
        }),
      })

      const newMessage = await response.json().catch(() => null)
      if (!response.ok || !newMessage) throw new Error(newMessage?.error || "Failed to send message")
```

Replace the `catch` of `handleSendMessage` so it shows the server's reason:

```tsx
    } catch (err) {
      console.error("Error sending message:", err)
      toast.error(err instanceof Error ? err.message : "Failed to send message")
    }
```

The three effects list `token` in their dependency arrays; add `authFetch` to each of those three arrays.

The loading skeleton never clears for a signed-in user with a slow session restore, because `setLoading(false)` only runs after a fetch. That is acceptable: `/direct` is protected by `middleware.ts`, so a token is always present here.

- [ ] **Step 10: Move the notifications page to `authFetch`**

In `components/notifications-page.tsx`:

Replace `const { token } = useAuth()` with:

```tsx
  const { token, authFetch } = useAuth()
```

Replace the list request:

```tsx
        const response = await authFetch("/api/notifications")
```

Replace the mark-read request:

```tsx
      const response = await authFetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIds }),
      })
```

Change the first effect's dependency array from `[token]` to `[token, authFetch]`.

- [ ] **Step 11: Typecheck the whole project**

Run: `npm run typecheck`
Expected: exits 0 with no output.

If errors remain, they will be in files this plan left untouched that depended on something removed. Fix each at its reported line: a missing property means the type in `lib/types.ts` was narrowed on purpose, so change the usage, not the type.

- [ ] **Step 12: Check the flows in the browser**

Using two accounts (the `smoke_manual_` one from Task 7 and a second one in a private window):

1. Settings, Profile tab: saved name, bio and website are prefilled. Change the bio, save, reload: the new bio is still there and shows on your profile.
2. Set a profile picture URL (`https://picsum.photos/200`): the preview updates, and after saving, the navbar avatar changes.
3. Settings, Account tab: change the password with a wrong current password: a toast says "Current password is incorrect". With the right one: success; log out and back in with the new password.
4. Settings, Notifications tab: switch off "New Like Notifications", save, reload: it is still off.
5. Settings, Privacy tab: switch on "Private Account", save, reload: it is still on.
6. Navbar: the plus icon opens `/create`, the heart opens `/notifications`.
7. Type the other account's username in the navbar search: it appears under Users. Press Enter: `/search` lists it. Search a word from a post caption: the post appears with its caption.
8. From the second account, open the first account's profile, click Follow (button becomes Unfollow, follower count goes to 1), then Message, and send "hello".
9. Back in the first account: `/notifications` shows the follow and the message; "Mark all as read" clears the highlights. `/direct` shows the conversation; reply to it.
10. In the browser devtools, delete the `token` entry from localStorage and set it to `x`, then reload: you are sent to `/login`.

Expected: all ten behave as described, with no red errors in the browser console.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "Fix settings, navigation, search, messages and notifications UI

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Lint and build clean, README, final verification

**Files:**
- Modify: `app/login/page.tsx:98`, any file `npm run lint` reports an error in
- Rewrite: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1 to 8.
- Produces: a branch where typecheck, lint, build and the smoke suite all pass.

- [ ] **Step 1: Fix the known lint error**

In `app/login/page.tsx`, replace `Don't have an account?{" "}` with:

```tsx
            Don&apos;t have an account?{" "}
```

- [ ] **Step 2: Run lint and fix every error**

Run: `npm run lint`
Expected after fixes: no lines containing `Error:`. Warnings are allowed.

Fix each reported error at its line using the remedy for its rule:

| Rule | Remedy |
| --- | --- |
| `react/no-unescaped-entities` | replace `'` with `&apos;` and `"` with `&quot;` in the JSX text |
| `@typescript-eslint/no-explicit-any` | replace `any` with the real type from `lib/types.ts`, or `unknown` plus a narrowing check |
| `@typescript-eslint/no-unused-vars` | delete the unused import or variable; for an unused `catch (error)`, write `catch {` |
| `@next/next/no-img-element` | this is a warning; leave it where the `eslint-disable-next-line` comment explains the user-supplied URL |
| `react-hooks/exhaustive-deps` | this is a warning; do not change behaviour to silence it |

Do not disable a rule in `eslint.config.mjs`.

- [ ] **Step 3: Build**

Stop the dev server first (a build and a dev server share `.next`).

Run: `npm run build`
Expected: `✓ Compiled successfully`, then a route table listing `/`, `/create`, `/direct`, `/explore`, `/login`, `/notifications`, `/p/[id]`, `/profile/[username]`, `/register`, `/search`, `/settings` and the `/api/...` routes, and exit code 0.

If the build fails on `useSearchParams() should be wrapped in a suspense boundary`, the page named in the message is missing the `<Suspense>` wrapper from Task 8 Steps 8 and 9.

- [ ] **Step 4: Rewrite `README.md`**

````markdown
# Devgram

Devgram is a developer-focused social app inspired by Instagram. Developers share screenshots, videos and code snippets, follow each other, comment and message.

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

`npm run smoke` registers two `smoke_...` users in the database from `.env.local`, exercises every endpoint, and deletes everything it created.

## Folder structure

```
devgram/
├── app/           # Pages and API route handlers (app/api)
├── components/    # Feature components and shadcn/ui primitives (components/ui)
├── contexts/      # Auth and posts React contexts
├── lib/           # Auth, database connection and server helpers
├── models/        # Mongoose models
├── public/        # Static files
├── scripts/       # Smoke test
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

## License

MIT © tmonga2208
````

- [ ] **Step 5: Run the full verification**

Start the dev server again: `npm run dev`

Run: `npm run typecheck && npm run lint && npm run smoke`
Expected: typecheck prints nothing, lint prints no `Error:` lines, smoke ends with `109 checks, 0 failed` and a `cleanup:` line.

Then confirm the smoke test left nothing behind:

Run: `node --env-file=.env.local -e "import('mongoose').then(async ({default: m}) => { await m.connect(process.env.MONGODB_URI); console.log('leftover smoke users:', await m.connection.collection('users').countDocuments({ username: /^smoke_[a-z0-9]{6}_[ab]$/ })); await m.disconnect() })"`
Expected: `leftover smoke users: 0`.

The `smoke_manual_` accounts created by hand in Tasks 7 and 8 are not removed by this. Tell the user they exist and ask whether to delete them; do not delete them unasked.

- [ ] **Step 6: Confirm nothing sensitive or stray is staged**

Run: `git status --short && git check-ignore .env.local`
Expected: only `README.md`, `app/login/page.tsx` and any lint-fix files are listed, and `.env.local` is printed by `check-ignore` (meaning it is ignored).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Clean lint and build, rewrite README to match the code

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
