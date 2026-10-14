# Photo and Video Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people pick a photo or video from their device for a post, and a photo for their profile picture: photos stored in Vercel Blob, videos in Mux, with playback and thumbnails.

**Architecture:** Authenticated API routes hand the browser short-lived upload credentials (a Blob client token for one path, or a one-time Mux upload address) and the browser uploads straight to the service, so nothing passes through a Vercel Function's 4.5 MB body limit. Posts store the Blob URL in `image`, or a Mux asset the server has verified in a new `muxVideo` field. Pure rules live in `lib/media-rules.ts` (unit-tested in Node); service calls in `lib/blob.ts` and `lib/mux.ts`; browser logic in `lib/image-prepare.ts`, `lib/upload-client.ts` and two hooks; UI in `components/media-picker.tsx`, `components/avatar-upload.tsx` and `components/mux-video.tsx`.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript, Tailwind CSS 4, Mongoose 8, `@vercel/blob` 2.8.1, `@mux/mux-node` 15.5.0, `@mux/upchunk` 3.5.0, `@mux/mux-player-react` 3.14.0. Tests: `node:test` for the rules, `scripts/smoke.mjs` for the API, `scripts/mobile-check.mjs` (headless Chrome) for the screens.

**Spec:** `docs/superpowers/specs/2026-10-14-media-uploads-design.md`

## Global Constraints

- Photos: JPEG, PNG, WebP or GIF only (`image/jpeg`, `image/png`, `image/webp`, `image/gif`), at most 10 MB (`10 * 1024 * 1024` bytes).
- A JPEG, PNG or WebP larger than 2048 px on its longer side, or larger than 2 MB (`2 * 1024 * 1024`), is drawn on a white canvas at most 2048 px on its longer side and saved as JPEG at quality 0.9. Smaller ones and every GIF upload unchanged.
- Photo upload tokens: valid 10 minutes, one content type, at most 10 MB, one path: `posts/<user id>/<uuid>.<ext>` or `avatars/<user id>/<uuid>.<ext>`.
- Videos: at most 200 MB (`200 * 1024 * 1024`) and 120 seconds.
- Mux uploads: `playback_policies: ["public"]`, `video_quality: "basic"`, `passthrough` = user id, `cors_origin` = the request's origin, `timeout: 3600`, and `test: true` when `MUX_TEST_UPLOADS=1`.
- The Create screen polls an upload every 2 seconds and gives up after 5 minutes of processing.
- User-facing copy, verbatim: "Upload failed. Try again." and "This photo format isn't supported here. Choose a JPEG, PNG, WebP or GIF."
- A stored photo is deleted only when its URL is in the acting user's own folder for that purpose. A failed delete at Blob or Mux is logged and never fails the request.
- The Mux client is created on first use. `npm run build` must pass without Blob or Mux credentials.
- Exact package versions: `@vercel/blob@2.8.1`, `@mux/mux-node@15.5.0`, `@mux/upchunk@3.5.0`, `@mux/mux-player-react@3.14.0`.
- Never print `.env.local` or any secret. Never run `vercel env pull` onto `.env.local` (it would replace the file). Run nothing against production without the user's OK.
- Mongoose caches schemas: restart the dev server after any change under `models/`.
- Every commit message ends with these two lines:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
  ```

**Dev server commands** (port 3000 belongs to another project; never stop it):

```bash
# start (in the background) and wait until it answers
npx next dev --turbopack -p 3210 > /tmp/devgram-dev.log 2>&1 &
for i in $(seq 1 60); do curl -s -o /dev/null -m 5 http://localhost:3210/api/health && break; sleep 1; done
# stop
lsof -ti tcp:3210 -sTCP:LISTEN | xargs kill
```

Test commands used below: `npm run test:unit`; `SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- <sections>`; `SMOKE_BASE_URL=http://localhost:3210 npm run mobile-check`.

## Review Focus

1. A HEIC photo, or any file the browser cannot decode, chosen in Chrome: the HEIC message appears, nothing uploads, the caption stays. Pinned in Task 7 (phone check).
2. A photo with huge dimensions but few bytes (a 3000×1500 PNG): the stored image is at most 2048 px wide. Pinned in Task 7 (phone check).
3. Pressing Post twice while the video is still processing: exactly one post. Pinned in Task 8 (phone check) and Task 6 (the same upload posted twice is 409).
4. A file that is not really a video: the upload ends as "failed" and posting it is refused. Pinned in Task 5 (smoke) and Task 6 (smoke).
5. Someone else's uploaded photo used as your post image or profile picture: deleting your post or changing your picture leaves their file alone. Pinned in Task 4 (smoke).

## File Structure

Create:

| File | Responsibility |
| --- | --- |
| `lib/media-rules.ts` | Limits and pure rules for photos and videos. No imports, so Node can load it in unit tests. |
| `scripts/unit/media-rules.test.mjs` | Unit tests for the rules. |
| `lib/blob.ts` | Server: issue a photo upload token, delete a user's own photo. |
| `lib/mux.ts` | Server: Mux client, create an upload, look an upload up, delete an asset. |
| `app/api/uploads/image/route.ts` | `POST`: a photo upload token. |
| `app/api/uploads/video/route.ts` | `POST`: a Mux upload address. |
| `app/api/uploads/video/[id]/route.ts` | `GET`: how far an upload has got. |
| `lib/image-prepare.ts` | Browser: check and shrink a photo before upload. |
| `lib/upload-client.ts` | Browser: talk to the upload routes, upload photos to Blob. |
| `hooks/use-photo-upload.ts` | Create form: upload a chosen photo and track it. |
| `hooks/use-video-upload.ts` | Create form: upload a chosen video and wait for Mux. |
| `components/media-picker.tsx` | Choose / preview / progress / change block. |
| `components/avatar-upload.tsx` | "Upload photo" button for the profile picture. |
| `components/mux-video.tsx` | Mux Player, loaded lazily. |
| `lib/media-urls.ts` | Mux thumbnail URLs. |
| `scripts/fixtures/*` | `clip-2s.mp4`, `not-a-video.mp4`, `wide-3000x1500.png`, `not-a-photo.heic`. |

Modify: `package.json`, `package-lock.json`, `models/Post.ts`, `lib/types.ts`, `app/api/posts/route.ts`, `app/api/posts/[id]/route.ts`, `app/api/users/profile/route.ts`, `contexts/posts-context.tsx`, `components/create-post-form.tsx`, `components/edit-profile-form.tsx`, `components/post.tsx`, `components/post-detail.tsx`, `components/explore-post.tsx`, `components/profile-post.tsx`, `scripts/smoke.mjs`, `scripts/lib/test-users.mjs`, `scripts/lib/browser.mjs`, `scripts/mobile-check.mjs`, `README.md`, the spec.

---

### Task 1: Provision Blob and Mux, install the packages

**Files:**
- Modify: `package.json`, `package-lock.json`
- Local only (never committed): `.env.local`

**Interfaces:**
- Produces: environment variables `BLOB_READ_WRITE_TOKEN`, `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` on Vercel (Production, Preview, Development) and in `.env.local`, plus `MUX_TEST_UPLOADS=1` in `.env.local` only.

- [ ] **Step 1: Install the packages**

Run: `npm install @vercel/blob@2.8.1 @mux/mux-node@15.5.0 @mux/upchunk@3.5.0 @mux/mux-player-react@3.14.0`
Expected: exit 0, and `npm ls @vercel/blob @mux/mux-node @mux/upchunk @mux/mux-player-react` lists exactly those versions.

- [ ] **Step 2: Create the live site's Blob store**

Run: `vercel blob create-store devgram-media --access public --environment production --environment preview --yes`
Expected: the store is created and connected to the linked `devgram` project; `vercel env ls` lists `BLOB_READ_WRITE_TOKEN` for Production and Preview.

- [ ] **Step 3: Create the local development Blob store**

Run: `vercel blob create-store devgram-media-dev --access public --environment development --yes`
Expected: `vercel env ls` lists `BLOB_READ_WRITE_TOKEN` for Development as well.

- [ ] **Step 4: Add Mux**

Run: `vercel integration add mux --yes`
Expected: `vercel env ls` lists `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` for Production, Preview and Development. If the command stops for a browser or dashboard step (Mux account, terms or plan), stop and ask the user to finish it in the Vercel dashboard, then re-check `vercel env ls`. Do not run the command a second time: that can create a second Mux resource.

- [ ] **Step 5: Copy the development keys into `.env.local` without printing them**

```bash
SCRATCH=$(mktemp -d)
vercel env pull "$SCRATCH/env.development" --environment=development --yes
python3 - "$SCRATCH/env.development" <<'EOF'
import sys
wanted = ["BLOB_READ_WRITE_TOKEN", "MUX_TOKEN_ID", "MUX_TOKEN_SECRET"]
values = {}
for line in open(sys.argv[1]):
    key, sep, value = line.rstrip("\n").partition("=")
    if key in wanted and sep:
        values[key] = value
missing = [key for key in wanted if key not in values]
if missing:
    raise SystemExit(f"missing from Development: {missing}")
lines = open(".env.local").read().rstrip("\n").split("\n")
lines = [line for line in lines if line.partition("=")[0].strip() not in wanted + ["MUX_TEST_UPLOADS"]]
lines += [f"{key}={values[key]}" for key in wanted] + ["MUX_TEST_UPLOADS=1"]
open(".env.local", "w").write("\n".join(lines) + "\n")
print("added:", ", ".join(wanted + ["MUX_TEST_UPLOADS"]))
EOF
rm -rf "$SCRATCH"
```

Expected: `added: BLOB_READ_WRITE_TOKEN, MUX_TOKEN_ID, MUX_TOKEN_SECRET, MUX_TEST_UPLOADS`. `MONGODB_URI` and `JWT_SECRET` are untouched.

- [ ] **Step 6: Prove both services answer with the local keys**

```bash
node --env-file=.env.local --input-type=module -e '
import { list } from "@vercel/blob"
import Mux from "@mux/mux-node"
const { blobs } = await list({ limit: 1 })
console.log("blob store reachable, files on first page:", blobs.length)
const page = await new Mux().video.assets.list({ limit: 1 })
console.log("mux reachable, assets on first page:", page.data.length)
'
```

Expected: both lines print, no error.

- [ ] **Step 7: Build without credentials still works, then commit**

Run: `npm run build`
Expected: exit 0.

```bash
git add package.json package-lock.json
git commit -F - <<'EOF'
Add the Vercel Blob and Mux packages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 2: Media rules with unit tests

**Files:**
- Create: `lib/media-rules.ts`, `scripts/unit/media-rules.test.mjs`
- Modify: `package.json` (script `test:unit`)

**Interfaces:**
- Produces (`lib/media-rules.ts`):
  - `PHOTO_TYPES: string[]`, `MAX_PHOTO_BYTES`, `PHOTO_MAX_SIDE = 2048`, `PHOTO_SHRINK_BYTES`, `MAX_VIDEO_BYTES`, `MAX_VIDEO_SECONDS = 120`, `VIDEO_TOO_LONG: string`
  - `type PhotoPurpose = "post" | "avatar"`
  - `isPhotoType(type: string): boolean`, `isPhotoPurpose(value: unknown): value is PhotoPurpose`
  - `photoFolder(purpose, userId): string`, `photoPath(purpose, userId, contentType, id): string`
  - `ownsPhotoUrl(url: unknown, purpose, userId): boolean`
  - `photoTargetSize(width, height, bytes, type): { width: number; height: number } | null`
  - `interface MuxAssetSummary { status: string; passthrough?: string; duration?: number; playback_ids?: Array<{ id: string; policy: string }> }`
  - `videoAssetProblem(asset: MuxAssetSummary, userId: string): { status: number; message: string } | null`

- [ ] **Step 1: Write the failing tests**

`scripts/unit/media-rules.test.mjs`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  MAX_VIDEO_SECONDS,
  VIDEO_TOO_LONG,
  isPhotoPurpose,
  isPhotoType,
  ownsPhotoUrl,
  photoPath,
  photoTargetSize,
  videoAssetProblem,
} from "../../lib/media-rules.ts"

const USER = "64b7f0c2a1b2c3d4e5f60718"
const OTHER = "64b7f0c2a1b2c3d4e5f60719"
const HOST = "https://abc123.public.blob.vercel-storage.com"

test("accepts the four photo types and nothing else", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) assert.equal(isPhotoType(type), true)
  for (const type of ["image/heic", "image/svg+xml", "video/mp4", ""]) assert.equal(isPhotoType(type), false)
})

test("knows the two photo purposes", () => {
  assert.equal(isPhotoPurpose("post"), true)
  assert.equal(isPhotoPurpose("avatar"), true)
  assert.equal(isPhotoPurpose("banner"), false)
  assert.equal(isPhotoPurpose(undefined), false)
})

test("puts photos in the user's folder for the purpose", () => {
  assert.equal(photoPath("post", USER, "image/jpeg", "abc"), `posts/${USER}/abc.jpg`)
  assert.equal(photoPath("avatar", USER, "image/png", "abc"), `avatars/${USER}/abc.png`)
})

test("owns only Blob URLs inside the user's own folder", () => {
  assert.equal(ownsPhotoUrl(`${HOST}/posts/${USER}/a.jpg`, "post", USER), true)
  assert.equal(ownsPhotoUrl(`${HOST}/avatars/${USER}/a.jpg`, "avatar", USER), true)
  assert.equal(ownsPhotoUrl(`${HOST}/posts/${OTHER}/a.jpg`, "post", USER), false)
  assert.equal(ownsPhotoUrl(`${HOST}/avatars/${USER}/a.jpg`, "post", USER), false)
  assert.equal(ownsPhotoUrl(`https://example.com/posts/${USER}/a.jpg`, "post", USER), false)
  assert.equal(ownsPhotoUrl(`http://abc123.public.blob.vercel-storage.com/posts/${USER}/a.jpg`, "post", USER), false)
  assert.equal(ownsPhotoUrl(`${HOST}/posts/${USER}`, "post", USER), false)
  assert.equal(ownsPhotoUrl("/placeholder.svg", "avatar", USER), false)
  assert.equal(ownsPhotoUrl(undefined, "avatar", USER), false)
})

test("shrinks photos to 2048px on the longer side", () => {
  assert.deepEqual(photoTargetSize(4032, 3024, 3_000_000, "image/jpeg"), { width: 2048, height: 1536 })
  assert.deepEqual(photoTargetSize(1000, 3000, 500_000, "image/png"), { width: 683, height: 2048 })
})

test("redraws photos over 2 MB even when they are small enough", () => {
  assert.deepEqual(photoTargetSize(1200, 800, 3_000_000, "image/png"), { width: 1200, height: 800 })
})

test("keeps small photos and every GIF as they are", () => {
  assert.equal(photoTargetSize(1200, 800, 400_000, "image/jpeg"), null)
  assert.equal(photoTargetSize(2048, 2048, 2 * 1024 * 1024, "image/webp"), null)
  assert.equal(photoTargetSize(4000, 4000, 9_000_000, "image/gif"), null)
})

test("accepts a ready, public video of the user's that is at most 2 minutes", () => {
  const asset = { status: "ready", passthrough: USER, duration: MAX_VIDEO_SECONDS, playback_ids: [{ id: "p", policy: "public" }] }
  assert.equal(videoAssetProblem(asset, USER), null)
})

test("refuses someone else's, unfinished, failed, long and unplayable videos", () => {
  const ready = { status: "ready", passthrough: USER, duration: 10, playback_ids: [{ id: "p", policy: "public" }] }
  assert.equal(videoAssetProblem({ ...ready, passthrough: OTHER }, USER)?.status, 404)
  assert.equal(videoAssetProblem({ ...ready, status: "preparing" }, USER)?.status, 409)
  assert.equal(videoAssetProblem({ ...ready, status: "errored" }, USER)?.status, 400)
  assert.deepEqual(videoAssetProblem({ ...ready, duration: MAX_VIDEO_SECONDS + 0.5 }, USER), { status: 400, message: VIDEO_TOO_LONG })
  assert.equal(videoAssetProblem({ ...ready, playback_ids: [{ id: "p", policy: "signed" }] }, USER)?.status, 400)
  assert.equal(videoAssetProblem({ ...ready, playback_ids: undefined }, USER)?.status, 400)
})
```

Add to `package.json` scripts, after `"typecheck"`:

```json
"test:unit": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/unit/",
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm run test:unit`
Expected: FAIL with `Cannot find module` for `lib/media-rules.ts`.

- [ ] **Step 3: Write the rules**

`lib/media-rules.ts`:

```ts
// Limits and rules for uploaded photos and videos, shared by the API routes
// and the browser. It imports nothing, so the unit tests load it in Node.

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024
// A photo larger than this on its longer side, or in bytes, is redrawn in
// the browser before upload.
export const PHOTO_MAX_SIDE = 2048
export const PHOTO_SHRINK_BYTES = 2 * 1024 * 1024
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024
export const MAX_VIDEO_SECONDS = 120
export const VIDEO_TOO_LONG = "Videos can be at most 2 minutes long"

export type PhotoPurpose = "post" | "avatar"

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

export function isPhotoType(type: string): boolean {
  return PHOTO_TYPES.includes(type)
}

export function isPhotoPurpose(value: unknown): value is PhotoPurpose {
  return value === "post" || value === "avatar"
}

// Each user's photos live in their own folder, one per purpose.
export function photoFolder(purpose: PhotoPurpose, userId: string): string {
  return `${purpose === "post" ? "posts" : "avatars"}/${userId}/`
}

export function photoPath(purpose: PhotoPurpose, userId: string, contentType: string, id: string): string {
  return `${photoFolder(purpose, userId)}${id}.${EXTENSIONS[contentType]}`
}

// Whether the URL is a Blob file in the user's folder for that purpose. Only
// those files are deleted on the user's behalf, so a post that borrows
// someone else's uploaded photo cannot be used to delete it.
export function ownsPhotoUrl(url: unknown, purpose: PhotoPurpose, userId: string): boolean {
  if (typeof url !== "string") return false
  try {
    const { protocol, hostname, pathname } = new URL(url)
    return (
      protocol === "https:" &&
      hostname.endsWith(".public.blob.vercel-storage.com") &&
      pathname.startsWith(`/${photoFolder(purpose, userId)}`) &&
      pathname.length > photoFolder(purpose, userId).length + 1
    )
  } catch {
    return false
  }
}

// The size to redraw a photo at before upload, or null to upload it as it is.
export function photoTargetSize(
  width: number,
  height: number,
  bytes: number,
  type: string,
): { width: number; height: number } | null {
  if (type === "image/gif") return null
  const longer = Math.max(width, height)
  if (longer <= PHOTO_MAX_SIDE && bytes <= PHOTO_SHRINK_BYTES) return null
  const scale = Math.min(1, PHOTO_MAX_SIDE / longer)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export interface MuxAssetSummary {
  status: string
  passthrough?: string
  duration?: number
  playback_ids?: Array<{ id: string; policy: string }>
}

// Why the Mux asset cannot go on this user's post, or null when it can.
export function videoAssetProblem(
  asset: MuxAssetSummary,
  userId: string,
): { status: number; message: string } | null {
  if (asset.passthrough !== userId) return { status: 404, message: "Video upload not found" }
  if (asset.status === "errored") return { status: 400, message: "This video could not be processed" }
  if (asset.status !== "ready") return { status: 409, message: "This video is still processing" }
  if ((asset.duration ?? 0) > MAX_VIDEO_SECONDS) return { status: 400, message: VIDEO_TOO_LONG }
  if (!asset.playback_ids?.some((playback) => playback.policy === "public")) {
    return { status: 400, message: "This video cannot be played" }
  }
  return null
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run test:unit`
Expected: `pass 9`, `fail 0`.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: exit 0.

```bash
git add lib/media-rules.ts scripts/unit/media-rules.test.mjs package.json
git commit -F - <<'EOF'
Add upload limits and rules with unit tests

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 3: Photo upload API

**Files:**
- Create: `lib/blob.ts`, `app/api/uploads/image/route.ts`
- Modify: `scripts/smoke.mjs` (new `photos` section and helpers), `scripts/lib/test-users.mjs` (remove test users' files)

**Interfaces:**
- Consumes: `lib/media-rules.ts` from Task 2.
- Produces:
  - `issuePhotoUpload(purpose: PhotoPurpose, userId: string, contentType: string): Promise<{ pathname: string; token: string }>`
  - `deleteOwnPhoto(url: unknown, purpose: PhotoPurpose, userId: string): Promise<void>`
  - `POST /api/uploads/image` with `{ purpose, contentType, size }` → 200 `{ pathname, token }`, 401 signed out, 400 invalid.
  - Smoke helpers `uploadTestPhoto(user, purpose)` → URL, and `blobExists(url)` → boolean.

- [ ] **Step 1: Write the failing smoke section and the file cleanup**

In `scripts/smoke.mjs`, extend the imports at the top:

```js
import { readFile } from "node:fs/promises"
import { BlobNotFoundError, head, list } from "@vercel/blob"
import { put } from "@vercel/blob/client"
import { assertSameDatabase, removeTestUsers } from "./lib/test-users.mjs"
```

Add these helpers after `ensureUsers()`:

```js
const PHOTO_FIXTURE = new URL("../public/icons/icon-192.png", import.meta.url)

// Uploads the fixture PNG the way the browser does: a pass from the app, then
// straight to Blob. Returns the photo's public URL.
async function uploadTestPhoto(user, purpose) {
  const png = await readFile(PHOTO_FIXTURE)
  const pass = await api("POST", "/api/uploads/image", {
    token: user.token,
    body: { purpose, contentType: "image/png", size: png.length },
  })
  if (pass.status !== 200) throw new Error(`photo upload pass answered ${pass.status}`)
  const blob = await put(pass.data.pathname, png, { access: "public", token: pass.data.token, contentType: "image/png" })
  return blob.url
}

async function blobExists(url) {
  try {
    await head(url)
    return true
  } catch (error) {
    if (error instanceof BlobNotFoundError) return false
    throw error
  }
}
```

Add this section to `sections`, after `pwa`:

```js
  async photos() {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.log("  skip photos (BLOB_READ_WRITE_TOKEN is not set)")
      return
    }
    await ensureUsers()
    const { a } = state
    const png = await readFile(PHOTO_FIXTURE)
    const request = (changes = {}) => ({ purpose: "post", contentType: "image/png", size: png.length, ...changes })

    const anon = await api("POST", "/api/uploads/image", { body: request() })
    check("photo upload without token is 401", anon.status === 401, `status ${anon.status}`)
    const heic = await api("POST", "/api/uploads/image", { token: a.token, body: request({ contentType: "image/heic" }) })
    check("HEIC photo is 400", heic.status === 400, `status ${heic.status}`)
    const purpose = await api("POST", "/api/uploads/image", { token: a.token, body: request({ purpose: "banner" }) })
    check("unknown photo purpose is 400", purpose.status === 400, `status ${purpose.status}`)
    const tooBig = await api("POST", "/api/uploads/image", { token: a.token, body: request({ size: 10 * 1024 * 1024 + 1 }) })
    check("photo over 10 MB is 400", tooBig.status === 400, `status ${tooBig.status}`)
    const noSize = await api("POST", "/api/uploads/image", { token: a.token, body: request({ size: "big" }) })
    check("photo size that is not a number is 400", noSize.status === 400, `status ${noSize.status}`)

    const pass = await api("POST", "/api/uploads/image", { token: a.token, body: request() })
    check(
      "photo upload pass points into the caller's post folder",
      pass.status === 200 &&
        typeof pass.data?.token === "string" &&
        pass.data?.pathname?.startsWith(`posts/${a.user.id}/`) &&
        pass.data.pathname.endsWith(".png"),
      `status ${pass.status} ${pass.text.slice(0, 120)}`,
    )
    const avatarPass = await api("POST", "/api/uploads/image", { token: a.token, body: request({ purpose: "avatar" }) })
    check("avatar upload pass points into the caller's avatar folder", avatarPass.data?.pathname?.startsWith(`avatars/${a.user.id}/`))

    const uploaded = await put(pass.data.pathname, png, { access: "public", token: pass.data.token, contentType: "image/png" })
    const served = await fetch(uploaded.url)
    check(
      "the uploaded photo is served as a PNG",
      served.status === 200 && served.headers.get("content-type") === "image/png",
      `status ${served.status} type ${served.headers.get("content-type")}`,
    )
    const { blobs } = await list({ prefix: pass.data.pathname })
    check("the uploaded photo is in the store cleanup uses", blobs.length === 1, "the server uses a different Blob store from .env.local")
    const elsewhere = await put(`posts/${a.user.id}/elsewhere.png`, png, {
      access: "public",
      token: pass.data.token,
      contentType: "image/png",
    }).then(
      () => true,
      () => false,
    )
    check("an upload pass cannot write to another path", !elsewhere)
  },
```

In `scripts/lib/test-users.mjs`, import Blob's server functions at the top:

```js
import { del, list } from "@vercel/blob"
```

Add this function above `removeTestUsers`:

```js
// The test users' uploaded photos live in their own folders (lib/media-rules.ts).
async function removeTestFiles(userIds) {
  if (!process.env.BLOB_READ_WRITE_TOKEN || userIds.length === 0) return 0
  let removed = 0
  for (const id of userIds) {
    for (const prefix of [`posts/${id}/`, `avatars/${id}/`]) {
      const { blobs } = await list({ prefix, limit: 1000 })
      if (blobs.length > 0) {
        await del(blobs.map((blob) => blob.url))
        removed += blobs.length
      }
    }
  }
  return removed
}
```

Replace the body of `removeTestUsers` with:

```js
export async function removeTestUsers(baseUrl, usernames) {
  const { removed, name, userIds } = await withDatabase(async (db) => {
    const users = await db
      .collection("users")
      .find({ username: { $in: usernames } }, { projection: { _id: 1 } })
      .toArray()
    return {
      userIds: users.map((user) => String(user._id)),
      removed: {
        posts: await db.collection("posts").deleteMany({ "author.username": { $in: usernames } }),
        messages: await db
          .collection("messages")
          .deleteMany({ $or: [{ sender: { $in: usernames } }, { receiver: { $in: usernames } }] }),
        notifications: await db
          .collection("notifications")
          .deleteMany({ $or: [{ sender: { $in: usernames } }, { recipient: { $in: usernames } }] }),
        users: await db.collection("users").deleteMany({ username: { $in: usernames } }),
      },
      name: db.name,
    }
  })
  const files = await removeTestFiles(userIds)

  const leftovers = []
  for (const username of usernames) {
    const res = await fetch(`${baseUrl}/api/users/${username}`)
    if (res.status !== 404) leftovers.push(username)
  }

  return {
    summary: `cleanup (${name}): ${Object.entries(removed)
      .map(([key, value]) => `${key}=${value.deletedCount}`)
      .join(" ")} files=${files}`,
    leftovers,
  }
}
```

- [ ] **Step 2: Run the section to see it fail**

Start the dev server (Global Constraints), then run: `SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- photos`
Expected: FAIL. `photo upload without token is 401` fails with status 404 (the route does not exist), and the section throws at the first `put`.

- [ ] **Step 3: Write the Blob helpers and the route**

`lib/blob.ts`:

```ts
import { del } from "@vercel/blob"
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client"
import { MAX_PHOTO_BYTES, ownsPhotoUrl, photoPath, type PhotoPurpose } from "@/lib/media-rules"

const TOKEN_LIFETIME_MS = 10 * 60 * 1000

// A token that lets the browser upload one photo of this type, at most 10 MB,
// to one new path in the user's folder, during the next 10 minutes. The
// store's own read-write token never leaves the server.
export async function issuePhotoUpload(purpose: PhotoPurpose, userId: string, contentType: string) {
  const pathname = photoPath(purpose, userId, contentType, crypto.randomUUID())
  const token = await generateClientTokenFromReadWriteToken({
    pathname,
    allowedContentTypes: [contentType],
    maximumSizeInBytes: MAX_PHOTO_BYTES,
    validUntil: Date.now() + TOKEN_LIFETIME_MS,
    addRandomSuffix: false,
  })
  return { pathname, token }
}

// Deletes a photo the user uploaded for that purpose and leaves anything else
// alone: links to other sites and other people's uploads. A failure is
// logged, because the change that made the photo unused is already saved.
export async function deleteOwnPhoto(url: unknown, purpose: PhotoPurpose, userId: string) {
  if (!ownsPhotoUrl(url, purpose, userId)) return
  try {
    await del(url as string)
  } catch (error) {
    console.error("Could not delete photo", url, error)
  }
}
```

`app/api/uploads/image/route.ts`:

```ts
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { issuePhotoUpload } from "@/lib/blob"
import { handleRouteError, jsonError, readJson } from "@/lib/http"
import { MAX_PHOTO_BYTES, isPhotoPurpose, isPhotoType } from "@/lib/media-rules"

// Gives the browser a short-lived pass to upload one photo straight to Blob.
export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const body = await readJson(req)
    if (!body) return jsonError("Invalid request body", 400)

    const { purpose, contentType, size } = body
    if (!isPhotoPurpose(purpose)) return jsonError('Purpose must be "post" or "avatar"', 400)
    if (typeof contentType !== "string" || !isPhotoType(contentType)) {
      return jsonError("Photos must be JPEG, PNG, WebP or GIF", 400)
    }
    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
      return jsonError("Size must be a positive number of bytes", 400)
    }
    if (size > MAX_PHOTO_BYTES) return jsonError("Photos must be 10 MB or smaller", 400)

    return NextResponse.json(await issuePhotoUpload(purpose, auth.id, contentType))
  } catch (error) {
    return handleRouteError(error, "Photo upload error", "Failed to start the upload")
  }
}
```

- [ ] **Step 4: Run the section to see it pass**

Run: `SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- photos`
Expected: every `photos` check passes, then `cleanup (devgram_dev): … files=1` (the uploaded photo; nothing was written at the refused path) and `ok   cleanup removed the test users from the target's database`. If `an upload pass cannot write to another path` fails, Blob does not pin the token to its path: stop and record a ruling before going on, because Task 4's ownership rule relies on paths.

- [ ] **Step 5: Run the whole suite and commit**

Run: `npm run test:unit && npm run typecheck && SMOKE_BASE_URL=http://localhost:3210 npm run smoke`
Expected: unit tests pass; typecheck exit 0; smoke ends `N checks, 0 failed`.

```bash
git add lib/blob.ts app/api/uploads/image/route.ts scripts/smoke.mjs scripts/lib/test-users.mjs
git commit -F - <<'EOF'
Add photo upload passes for Vercel Blob

POST /api/uploads/image gives a signed-in user a 10-minute token for one
photo path in their own folder; the browser uploads straight to Blob.
Test cleanup now also removes the test users' uploaded files.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 4: Delete photos that are no longer used

**Files:**
- Modify: `app/api/posts/[id]/route.ts` (DELETE), `app/api/users/profile/route.ts` (PATCH), `scripts/smoke.mjs` (`photos` section)

**Interfaces:**
- Consumes: `deleteOwnPhoto(url, purpose, userId)` from Task 3; smoke helpers `uploadTestPhoto`, `blobExists`.

- [ ] **Step 1: Write the failing checks**

Append to the end of the `photos` section in `scripts/smoke.mjs`:

```js
    const { b } = state
    const post = await api("POST", "/api/posts", { token: a.token, body: { caption: `uploaded photo ${run}`, image: uploaded.url } })
    check("a post can use an uploaded photo", post.status === 201 && post.data?.image === uploaded.url, `status ${post.status}`)
    await api("DELETE", `/api/posts/${post.data?._id}`, { token: a.token })
    check("deleting the post deletes its uploaded photo", !(await blobExists(uploaded.url)))

    const lent = await uploadTestPhoto(a, "post")
    const borrowed = await api("POST", "/api/posts", { token: b.token, body: { caption: `borrowed ${run}`, image: lent } })
    await api("DELETE", `/api/posts/${borrowed.data?._id}`, { token: b.token })
    check("deleting a post that borrowed someone's photo keeps the photo", await blobExists(lent))

    const first = await uploadTestPhoto(a, "avatar")
    const second = await uploadTestPhoto(a, "avatar")
    await api("PATCH", "/api/users/profile", { token: a.token, body: { avatar: first } })
    const replaced = await api("PATCH", "/api/users/profile", { token: a.token, body: { avatar: second } })
    check("a new uploaded profile picture is saved", replaced.status === 200 && replaced.data?.avatar === second, `status ${replaced.status}`)
    check("the old profile picture is deleted", !(await blobExists(first)))
    await api("PATCH", "/api/users/profile", { token: b.token, body: { avatar: second } })
    await api("PATCH", "/api/users/profile", { token: b.token, body: { avatar: "" } })
    check("clearing a borrowed profile picture keeps the owner's file", await blobExists(second))
    const cleared = await api("PATCH", "/api/users/profile", { token: a.token, body: { avatar: "" } })
    check(
      "clearing your own profile picture deletes it",
      cleared.data?.avatar === "/placeholder.svg" && !(await blobExists(second)),
      `avatar ${cleared.data?.avatar}`,
    )
```

- [ ] **Step 2: Run the section to see it fail**

Run: `SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- photos`
Expected: FAIL on `deleting the post deletes its uploaded photo`, `the old profile picture is deleted` and `clearing your own profile picture deletes it`. The borrowed-photo checks pass (nothing deletes yet).

- [ ] **Step 3: Delete unused photos**

In `app/api/posts/[id]/route.ts`, add the import:

```ts
import { deleteOwnPhoto } from '@/lib/blob';
```

and replace

```ts
    await post.deleteOne();
    return NextResponse.json({ message: 'Post deleted successfully' });
```

with

```ts
    await post.deleteOne();
    // The post was its uploaded photo's only use; borrowed photos stay.
    await deleteOwnPhoto(post.image, 'post', auth.id);
    return NextResponse.json({ message: 'Post deleted successfully' });
```

In `app/api/users/profile/route.ts`, add the import:

```ts
import { deleteOwnPhoto } from "@/lib/blob"
```

and inside the existing `if (user.avatar !== previousAvatar) {` block, after the `await Promise.all([...])` call, add:

```ts
      // The replaced picture is no longer used anywhere.
      await deleteOwnPhoto(previousAvatar, "avatar", auth.id)
```

- [ ] **Step 4: Run the section to see it pass**

Run: `SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- photos`
Expected: every `photos` check passes; cleanup reports the leftover `lent` file among `files=`.

- [ ] **Step 5: Run the whole suite and commit**

Run: `npm run typecheck && SMOKE_BASE_URL=http://localhost:3210 npm run smoke`
Expected: exit 0; `N checks, 0 failed`.

```bash
git add "app/api/posts/[id]/route.ts" app/api/users/profile/route.ts scripts/smoke.mjs
git commit -F - <<'EOF'
Delete uploaded photos when their post or profile picture goes

Only files in the acting user's own folder are deleted, so borrowing
someone's uploaded photo cannot be used to remove it.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 5: Video upload API

**Files:**
- Create: `lib/mux.ts`, `app/api/uploads/video/route.ts`, `app/api/uploads/video/[id]/route.ts`, `scripts/fixtures/clip-2s.mp4`, `scripts/fixtures/not-a-video.mp4`
- Modify: `scripts/smoke.mjs` (new `videos` section and helpers), `scripts/lib/test-users.mjs` (remove test users' videos)

**Interfaces:**
- Produces (`lib/mux.ts`):
  - `isUploadId(id: string): boolean`
  - `createVideoUpload(userId: string, origin: string): Promise<{ uploadId: string; url: string }>`
  - `interface VideoUpload { status: "uploading" | "processing" | "ready" | "failed"; asset?: MuxAsset }` where `type MuxAsset = Awaited<ReturnType<Mux["video"]["assets"]["retrieve"]>>`
  - `findVideoUpload(uploadId: string, userId: string): Promise<VideoUpload | null>`
  - `publicPlaybackId(asset: MuxAsset): string | undefined`
  - `deleteVideoAsset(assetId: string): Promise<void>`
- Produces (HTTP): `POST /api/uploads/video` → 201 `{ uploadId, url }`; `GET /api/uploads/video/:id` → `{ status }`, plus `playbackId`, `aspectRatio`, `duration` when ready; 404 for someone else's or a malformed id.
- Produces (smoke): helpers `putFile(url, fixtureUrl)`, `waitForUpload(user, uploadId)`; `state.video = { uploadId, playbackId, junkUploadId }`.

- [ ] **Step 1: Make the fixtures**

```bash
mkdir -p scripts/fixtures
ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc=duration=2:size=360x640:rate=15 \
  -pix_fmt yuv420p -c:v libx264 -preset veryfast -crf 35 -movflags +faststart -an -y scripts/fixtures/clip-2s.mp4
python3 -c "open('scripts/fixtures/not-a-video.mp4', 'wb').write(b'This is not a video. ' * 3000)"
ls -l scripts/fixtures
```

Expected: `clip-2s.mp4` under 100 KB (vertical 360×640, 2 seconds) and `not-a-video.mp4` of 63000 bytes.

- [ ] **Step 2: Write the failing smoke section and the video cleanup**

In `scripts/smoke.mjs`, add to the imports:

```js
import Mux, { NotFoundError } from "@mux/mux-node"
```

Add these helpers after `blobExists`:

```js
const CLIP_FIXTURE = new URL("./fixtures/clip-2s.mp4", import.meta.url)
const NOT_A_VIDEO_FIXTURE = new URL("./fixtures/not-a-video.mp4", import.meta.url)

async function putFile(url, fixture) {
  const res = await fetch(url, { method: "PUT", body: await readFile(fixture) })
  if (!res.ok) throw new Error(`upload to Mux answered ${res.status}`)
}

// Polls the upload until Mux says ready or failed, for at most two minutes.
async function waitForUpload(user, uploadId) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const res = await api("GET", `/api/uploads/video/${uploadId}`, { token: user.token })
    if (res.data?.status === "ready" || res.data?.status === "failed") return res.data
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  return { status: "still waiting after two minutes" }
}
```

Add this section to `sections`, after `photos`:

```js
  async videos() {
    if (!process.env.MUX_TOKEN_ID) {
      console.log("  skip videos (MUX_TOKEN_ID is not set)")
      return
    }
    await ensureUsers()
    const { a, b } = state

    const anon = await api("POST", "/api/uploads/video")
    check("video upload without token is 401", anon.status === 401, `status ${anon.status}`)
    const created = await api("POST", "/api/uploads/video", { token: a.token })
    check(
      "video upload is 201 with an upload address",
      created.status === 201 && typeof created.data?.uploadId === "string" && created.data?.url?.startsWith("https://"),
      `status ${created.status} ${created.text.slice(0, 120)}`,
    )
    const { uploadId, url } = created.data
    const otherUser = await api("GET", `/api/uploads/video/${uploadId}`, { token: b.token })
    check("someone else's upload is 404", otherUser.status === 404, `status ${otherUser.status}`)
    const anonStatus = await api("GET", `/api/uploads/video/${uploadId}`)
    check("upload status without token is 401", anonStatus.status === 401, `status ${anonStatus.status}`)
    const malformed = await api("GET", "/api/uploads/video/not-an-upload", { token: a.token })
    check("a malformed upload id is 404", malformed.status === 404, `status ${malformed.status}`)
    const waiting = await api("GET", `/api/uploads/video/${uploadId}`, { token: a.token })
    check("a new upload is still uploading", waiting.data?.status === "uploading", JSON.stringify(waiting.data))

    await putFile(url, CLIP_FIXTURE)
    const ready = await waitForUpload(a, uploadId)
    check("an uploaded clip becomes ready with a playback id", ready.status === "ready" && typeof ready.playbackId === "string", JSON.stringify(ready))
    check("the clip keeps its vertical shape", ready.aspectRatio === "9:16", `aspect ratio ${ready.aspectRatio}`)

    const junk = await api("POST", "/api/uploads/video", { token: a.token })
    await putFile(junk.data.url, NOT_A_VIDEO_FIXTURE)
    const failed = await waitForUpload(a, junk.data.uploadId)
    check("a file that is not a video ends as failed", failed.status === "failed", JSON.stringify(failed))

    state.video = { uploadId, playbackId: ready.playbackId, junkUploadId: junk.data.uploadId }
  },
```

In `scripts/lib/test-users.mjs`, add the import:

```js
import Mux from "@mux/mux-node"
```

Add above `removeTestUsers`:

```js
// The test users' videos carry their id as Mux passthrough (lib/mux.ts).
// Looks through the 300 newest assets, which covers any test run.
async function removeTestVideos(userIds) {
  if (!process.env.MUX_TOKEN_ID || userIds.length === 0) return 0
  const mux = new Mux()
  let removed = 0
  let seen = 0
  for await (const asset of mux.video.assets.list({ limit: 100 })) {
    if (userIds.includes(asset.passthrough)) {
      await mux.video.assets.delete(asset.id)
      removed++
    }
    if (++seen >= 300) break
  }
  return removed
}
```

In `removeTestUsers`, after `const files = await removeTestFiles(userIds)`, add:

```js
  const videos = await removeTestVideos(userIds)
```

and change the end of the summary from `` .join(" ")} files=${files}` `` to `` .join(" ")} files=${files} videos=${videos}` ``.

- [ ] **Step 3: Run the section to see it fail**

Run: `SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- videos`
Expected: FAIL. `video upload without token is 401` fails with status 404, and the section throws at `created.data` being null.

- [ ] **Step 4: Write the Mux helpers and the routes**

`lib/mux.ts`:

```ts
import Mux, { NotFoundError } from "@mux/mux-node"

type MuxAsset = Awaited<ReturnType<Mux["video"]["assets"]["retrieve"]>>

let client: Mux | null = null

// Created on first use, so builds and requests that never touch video do not
// need the Mux credentials. It reads MUX_TOKEN_ID and MUX_TOKEN_SECRET.
function mux() {
  client ??= new Mux()
  return client
}

// Mux upload ids are letters and digits; anything else is not one of ours.
export function isUploadId(id: string) {
  return /^[A-Za-z0-9]{10,100}$/.test(id)
}

// A one-time address the browser uploads one video to, tagged with the
// user's id. With MUX_TEST_UPLOADS=1 (local development) Mux makes free test
// videos: watermarked, cut to 10 seconds and deleted after a day.
export async function createVideoUpload(userId: string, origin: string) {
  const upload = await mux().video.uploads.create({
    cors_origin: origin,
    timeout: 3600,
    test: process.env.MUX_TEST_UPLOADS === "1",
    new_asset_settings: {
      playback_policies: ["public"],
      video_quality: "basic",
      passthrough: userId,
    },
  })
  if (!upload.url) throw new Error("Mux returned an upload without an address")
  return { uploadId: upload.id, url: upload.url }
}

export interface VideoUpload {
  status: "uploading" | "processing" | "ready" | "failed"
  asset?: MuxAsset
}

// Where the user's upload stands, or null when there is no such upload or it
// belongs to someone else.
export async function findVideoUpload(uploadId: string, userId: string): Promise<VideoUpload | null> {
  if (!isUploadId(uploadId)) return null
  let upload
  try {
    upload = await mux().video.uploads.retrieve(uploadId)
  } catch (error) {
    if (error instanceof NotFoundError) return null
    throw error
  }
  if (upload.new_asset_settings?.passthrough !== userId) return null
  if (upload.status === "waiting") return { status: "uploading" }
  if (upload.status !== "asset_created" || !upload.asset_id) return { status: "failed" }

  const asset = await mux().video.assets.retrieve(upload.asset_id)
  if (asset.status === "errored") return { status: "failed", asset }
  return { status: asset.status === "ready" ? "ready" : "processing", asset }
}

export function publicPlaybackId(asset: MuxAsset) {
  return asset.playback_ids?.find((playback) => playback.policy === "public")?.id
}

// Removes a video from Mux. One that is already gone counts as removed; other
// failures are logged, since the post that used it is already deleted.
export async function deleteVideoAsset(assetId: string) {
  try {
    await mux().video.assets.delete(assetId)
  } catch (error) {
    if (!(error instanceof NotFoundError)) console.error("Could not delete video", assetId, error)
  }
}
```

`app/api/uploads/video/route.ts`:

```ts
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { handleRouteError } from "@/lib/http"
import { createVideoUpload } from "@/lib/mux"

// Gives the browser a one-time Mux address to upload one video to.
export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const origin = req.headers.get("origin") || new URL(req.url).origin
    return NextResponse.json(await createVideoUpload(auth.id, origin), { status: 201 })
  } catch (error) {
    return handleRouteError(error, "Video upload error", "Failed to start the upload")
  }
}
```

`app/api/uploads/video/[id]/route.ts`:

```ts
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { handleRouteError, jsonError } from "@/lib/http"
import { findVideoUpload, publicPlaybackId } from "@/lib/mux"

type Context = { params: Promise<{ id: string }> }

// How far the caller's video upload has got. Someone else's upload is 404.
export async function GET(req: Request, { params }: Context) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const upload = await findVideoUpload(id, auth.id)
    if (!upload) return jsonError("Video upload not found", 404)
    if (upload.status !== "ready" || !upload.asset) return NextResponse.json({ status: upload.status })

    return NextResponse.json({
      status: "ready",
      playbackId: publicPlaybackId(upload.asset),
      aspectRatio: upload.asset.aspect_ratio,
      duration: upload.asset.duration,
    })
  } catch (error) {
    return handleRouteError(error, "Video status error", "Failed to read the upload")
  }
}
```

- [ ] **Step 5: Run the section to see it pass**

Run: `SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- videos`
Expected: every `videos` check passes; cleanup reports `videos=` at least 1.

- [ ] **Step 6: Run the whole suite and commit**

Run: `npm run typecheck && SMOKE_BASE_URL=http://localhost:3210 npm run smoke`
Expected: exit 0; `N checks, 0 failed`.

```bash
git add lib/mux.ts app/api/uploads/video scripts/fixtures/clip-2s.mp4 scripts/fixtures/not-a-video.mp4 scripts/smoke.mjs scripts/lib/test-users.mjs
git commit -F - <<'EOF'
Add Mux direct uploads for videos

POST /api/uploads/video creates a one-time Mux upload tagged with the
user; GET /api/uploads/video/:id reports uploading, processing, ready or
failed to its owner only. Test cleanup also removes the test users' videos.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 6: Posts with an uploaded video

**Files:**
- Modify: `models/Post.ts`, `lib/types.ts`, `app/api/posts/route.ts`, `app/api/posts/[id]/route.ts`, `contexts/posts-context.tsx`, `scripts/smoke.mjs` (`videos` section)

**Interfaces:**
- Consumes: `findVideoUpload`, `publicPlaybackId`, `deleteVideoAsset` (Task 5); `videoAssetProblem`, `VIDEO_TOO_LONG` (Task 2); `state.video` (Task 5 smoke).
- Produces: `Post.muxVideo?: { assetId: string; playbackId: string; aspectRatio?: string; duration?: number }` in the model, in `PostType` and in every post response; `POST /api/posts` accepts `videoUploadId`; `NewPost.videoUploadId?: string`.

- [ ] **Step 1: Write the failing checks**

Add a helper after `waitForUpload` in `scripts/smoke.mjs`:

```js
async function muxAssetExists(assetId) {
  try {
    await new Mux().video.assets.retrieve(assetId)
    return true
  } catch (error) {
    if (error instanceof NotFoundError) return false
    throw error
  }
}
```

Append to the end of the `videos` section:

```js
    const foreign = await api("POST", "/api/posts", { token: b.token, body: { caption: `taken ${run}`, videoUploadId: uploadId } })
    check("posting someone else's video is 404", foreign.status === 404, `status ${foreign.status}`)
    const both = await api("POST", "/api/posts", {
      token: a.token,
      body: { caption: `both ${run}`, videoUploadId: uploadId, video: "https://youtu.be/dQw4w9WgXcQ" },
    })
    check("an uploaded video plus a video link is 400", both.status === 400, `status ${both.status}`)
    const pending = await api("POST", "/api/uploads/video", { token: a.token })
    const early = await api("POST", "/api/posts", { token: a.token, body: { caption: `early ${run}`, videoUploadId: pending.data?.uploadId } })
    check("posting a video that has not been uploaded is 409", early.status === 409, `status ${early.status}`)
    await new Mux().video.uploads.cancel(pending.data.uploadId)
    const junkPost = await api("POST", "/api/posts", { token: a.token, body: { caption: `junk ${run}`, videoUploadId: junk.data.uploadId } })
    check("posting a video Mux could not process is 400", junkPost.status === 400, `status ${junkPost.status}`)

    const videoPost = await api("POST", "/api/posts", { token: a.token, body: { caption: `video post ${run}`, videoUploadId: uploadId } })
    check(
      "posting a ready video is 201 with its playback id and shape",
      videoPost.status === 201 && videoPost.data?.muxVideo?.playbackId === ready.playbackId && videoPost.data?.muxVideo?.aspectRatio === "9:16",
      `status ${videoPost.status} ${videoPost.text.slice(0, 160)}`,
    )
    const again = await api("POST", "/api/posts", { token: a.token, body: { caption: `again ${run}`, videoUploadId: uploadId } })
    check("the same video cannot be posted twice", again.status === 409, `status ${again.status}`)
    const listed = await api("GET", `/api/posts/${videoPost.data?._id}`)
    check("the post page returns the video", listed.data?.muxVideo?.playbackId === ready.playbackId)
    const assetId = videoPost.data?.muxVideo?.assetId
    await api("DELETE", `/api/posts/${videoPost.data?._id}`, { token: a.token })
    check("deleting the post deletes its video from Mux", typeof assetId === "string" && !(await muxAssetExists(assetId)))
```

- [ ] **Step 2: Run the section to see it fail**

Run: `SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- videos`
Expected: FAIL on `posting someone else's video is 404` (201: the field is ignored today), `posting a ready video is 201 with its playback id and shape` (no `muxVideo`) and the checks after it.

- [ ] **Step 3: Store verified videos on posts**

In `models/Post.ts`, add to `IPost` after `language?: string;`:

```ts
  muxVideo?: {
    assetId: string;
    playbackId: string;
    aspectRatio?: string;
    duration?: number;
  };
```

add to the schema after the `language` field:

```ts
    // A video uploaded to Mux (lib/mux.ts). `video` holds a pasted link instead.
    muxVideo: {
      type: new mongoose.Schema(
        {
          assetId: { type: String, required: true },
          playbackId: { type: String, required: true },
          aspectRatio: String,
          duration: Number,
        },
        { _id: false },
      ),
      required: false,
    },
```

and after the existing indexes:

```ts
// One post per uploaded video, even when two requests race.
postSchema.index({ 'muxVideo.assetId': 1 }, { unique: true, sparse: true });
```

In `lib/types.ts`, add to `PostType` after `language?: string`:

```ts
  muxVideo?: {
    assetId: string
    playbackId: string
    aspectRatio?: string
    duration?: number
  }
```

In `contexts/posts-context.tsx`, add to `NewPost` after `language?: string;`:

```ts
  videoUploadId?: string;
```

In `app/api/posts/route.ts`, add the imports:

```ts
import { VIDEO_TOO_LONG, videoAssetProblem } from '@/lib/media-rules';
import { deleteVideoAsset, findVideoUpload, publicPlaybackId } from '@/lib/mux';
```

after the line `if (video && !isHttpUrl(video)) return jsonError('Video must be an http(s) URL', 400);` add:

```ts
    const videoUploadId = optionalString(body.videoUploadId);
    if (videoUploadId && video) return jsonError('Choose either an uploaded video or a video link', 400);
```

after `if (!author) return jsonError('Authentication required', 401);` add:

```ts
    let muxVideo;
    if (videoUploadId) {
      const upload = await findVideoUpload(videoUploadId, auth.id);
      if (!upload) return jsonError('Video upload not found', 404);
      if (!upload.asset) {
        return upload.status === 'failed'
          ? jsonError('This video could not be processed', 400)
          : jsonError('This video is still uploading', 409);
      }
      const problem = videoAssetProblem(upload.asset, auth.id);
      if (problem) {
        // A video over the limit can never be posted, so it is not kept.
        if (problem.message === VIDEO_TOO_LONG) await deleteVideoAsset(upload.asset.id);
        return jsonError(problem.message, problem.status);
      }
      if (await Post.exists({ 'muxVideo.assetId': upload.asset.id })) {
        return jsonError('This video is already posted', 409);
      }
      muxVideo = {
        assetId: upload.asset.id,
        playbackId: publicPlaybackId(upload.asset) as string,
        aspectRatio: upload.asset.aspect_ratio,
        duration: upload.asset.duration,
      };
    }
```

and in the `Post.create({...})` call add `muxVideo,` after `video,`.

In `app/api/posts/[id]/route.ts`, add the import:

```ts
import { deleteVideoAsset } from '@/lib/mux';
```

and after `await deleteOwnPhoto(post.image, 'post', auth.id);` add:

```ts
    if (post.muxVideo?.assetId) await deleteVideoAsset(post.muxVideo.assetId);
```

- [ ] **Step 4: Restart the dev server, then run the section to see it pass**

Restart the dev server (stop, then start, as in Global Constraints): the Post schema changed.
Run: `SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- videos`
Expected: every `videos` check passes.

- [ ] **Step 5: Run the whole suite and commit**

Run: `npm run typecheck && npm run lint && SMOKE_BASE_URL=http://localhost:3210 npm run smoke`
Expected: exit 0; lint 0 errors; `N checks, 0 failed`.

```bash
git add models/Post.ts lib/types.ts app/api/posts/route.ts "app/api/posts/[id]/route.ts" contexts/posts-context.tsx scripts/smoke.mjs
git commit -F - <<'EOF'
Post uploaded videos once Mux has them ready

POST /api/posts accepts videoUploadId and checks with Mux that the video
is the caller's, ready, public and at most 2 minutes long before storing
it as muxVideo. Deleting the post deletes the video from Mux.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 7: Choose a photo on the Create screen and in Settings

**Files:**
- Create: `lib/image-prepare.ts`, `lib/upload-client.ts`, `hooks/use-photo-upload.ts`, `components/media-picker.tsx`, `components/avatar-upload.tsx`, `scripts/fixtures/wide-3000x1500.png`, `scripts/fixtures/not-a-photo.heic`
- Modify: `components/create-post-form.tsx`, `components/edit-profile-form.tsx`, `scripts/lib/browser.mjs`, `scripts/mobile-check.mjs`

**Interfaces:**
- Consumes: `POST /api/uploads/image` (Task 3); `isPhotoType`, `photoTargetSize`, `MAX_PHOTO_BYTES`, `PhotoPurpose` (Task 2).
- Produces:
  - `lib/image-prepare.ts`: `class PhotoError extends Error`, `UNSUPPORTED_PHOTO: string`, `preparePhoto(file: File): Promise<File>`
  - `lib/upload-client.ts`: `type AuthFetch`, `UPLOAD_FAILED: string`, `errorFrom(response: Response): Promise<string>`, `uploadPhoto(photo: File, purpose: PhotoPurpose, authFetch: AuthFetch, options?: { onProgress?: (percent: number) => void; signal?: AbortSignal }): Promise<string>`
  - `hooks/use-photo-upload.ts`: `usePhotoUpload(purpose: PhotoPurpose): { photo: PhotoUploadState | null; select(file: File): Promise<void>; clear(): void }` with `PhotoUploadState { previewUrl: string | null; progress: number; url: string | null; error: string | null }`
  - `components/media-picker.tsx`: `MediaPicker({ kind, previewUrl, progress, status, error, onSelect, onClear })`
  - `components/avatar-upload.tsx`: `AvatarUpload({ onUploaded: (url: string) => void })`
  - `scripts/lib/browser.mjs` page methods `setInputFiles(selector, paths)` and `type(selector, text)`.

- [ ] **Step 1: Make the fixtures**

```bash
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=0x3b82f6:size=3000x1500 -frames:v 1 -y scripts/fixtures/wide-3000x1500.png
printf 'not really a photo' > scripts/fixtures/not-a-photo.heic
ls -l scripts/fixtures
```

Expected: a 3000×1500 PNG (a few KB) and an 18-byte `.heic` file.

- [ ] **Step 2: Add file and typing helpers to the browser client**

In `scripts/lib/browser.mjs`, inside the `page` object after `waitFor`, add:

```js
      // Puts files into a file input, as if the person had chosen them.
      async setInputFiles(selector, files) {
        const { root } = await cdp("DOM.getDocument", { depth: 0 })
        const { nodeId } = await cdp("DOM.querySelector", { nodeId: root.nodeId, selector })
        if (!nodeId) throw new Error(`no element matches ${selector}`)
        await cdp("DOM.setFileInputFiles", { nodeId, files })
      },

      // Focuses the element and types into it the way a keyboard would.
      async type(selector, text) {
        const focused = await page.evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)})
          if (!el) return false
          el.focus()
          return true
        })()`)
        if (!focused) throw new Error(`no element matches ${selector}`)
        await cdp("Input.insertText", { text })
      },
```

- [ ] **Step 3: Write the failing phone checks**

In `scripts/mobile-check.mjs`, add to the imports:

```js
import { fileURLToPath } from "node:url"
```

add after the `TAP_TARGET` constant:

```js
const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
const buttonHeight = (text) => `(() => {
  const button = [...document.querySelectorAll("main button")].find((b) => b.textContent.includes(${JSON.stringify(text)}))
  return button ? button.getBoundingClientRect().height : 0
})()`
```

and insert this block in `main()` right before `console.log("\n[small phone]")`:

```js
    console.log("\n[photo upload]")
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.log("  skip photo upload (BLOB_READ_WRITE_TOKEN is not set)")
    } else {
      const photoInput = 'main input[type="file"][accept^="image"]'
      await open(page, "/create")
      const chooser = await page.evaluate(buttonHeight("Choose photo"))
      check(`create: the Choose photo button is at least ${TAP_TARGET}px tall`, chooser >= TAP_TARGET, `height ${chooser}px`)

      await page.setInputFiles(photoInput, [fixture("not-a-photo.heic")])
      check(
        "create: a photo the browser cannot read gets a clear message",
        await page.waitFor(`document.querySelector("main").textContent.includes("This photo format isn't supported here")`, { timeout: 5000 }),
      )

      await page.setInputFiles(photoInput, [fixture("wide-3000x1500.png")])
      check(
        "create: the chosen photo shows a preview and finishes uploading",
        await page.waitFor(
          `[...document.querySelectorAll("main img")].some((img) => img.src.startsWith("blob:")) &&
           document.querySelector("main").textContent.includes("Photo ready")`,
          { timeout: 30000 },
        ),
      )
      const caption = `phone photo ${run}`
      await page.type("#caption", caption)
      await page.evaluate(click(`[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "Post")`))
      const posted = await page.waitFor(`location.pathname === "/"`, { timeout: 15000 })
      await sleep(800)
      const stored = await page.evaluate(`(async () => {
        const text = [...document.querySelectorAll("main p")].find((p) => p.textContent.includes(${JSON.stringify(caption)}))
        const img = text?.closest(".rounded-lg")?.querySelector('img[src*=".public.blob.vercel-storage.com/posts/"]')
        if (!img) return null
        await img.decode().catch(() => undefined)
        return { width: img.naturalWidth, height: img.naturalHeight }
      })()`)
      check("create: the post appears in the feed with the uploaded photo", posted && stored !== null, JSON.stringify(stored))
      check("create: a 3000px photo is stored at most 2048px wide", stored !== null && stored.width > 0 && stored.width <= 2048, JSON.stringify(stored))

      console.log("\n[profile picture upload]")
      await open(page, "/settings")
      const avatarButton = await page.evaluate(buttonHeight("Upload photo"))
      check(`settings: the Upload photo button is at least ${TAP_TARGET}px tall`, avatarButton >= TAP_TARGET, `height ${avatarButton}px`)
      await page.setInputFiles(photoInput, [fixture("wide-3000x1500.png")])
      check(
        "settings: an uploaded profile picture fills the picture field",
        await page.waitFor(`document.querySelector("#avatar")?.value.includes(".public.blob.vercel-storage.com/avatars/")`, { timeout: 30000 }),
      )
      await page.evaluate(click(`[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "Save Profile")`))
      await sleep(1500)
      await open(page, `/profile/${names.a}`)
      const avatarSrc = await page.evaluate(`document.querySelector("main img")?.src || ""`)
      check("profile: shows the uploaded profile picture", avatarSrc.includes("/avatars/"), avatarSrc)
    }
```

- [ ] **Step 4: Run the phone check to see it fail**

Run: `SMOKE_BASE_URL=http://localhost:3210 npm run mobile-check`
Expected: FAIL on the photo checks: `Choose photo` height 0, and the check stops early at `no element matches main input[type="file"][accept^="image"]` (reported as `the check stopped early`).

- [ ] **Step 5: Write the browser photo code**

`lib/image-prepare.ts`:

```ts
import { MAX_PHOTO_BYTES, isPhotoType, photoTargetSize } from "@/lib/media-rules"

export class PhotoError extends Error {}

export const UNSUPPORTED_PHOTO = "This photo format isn't supported here. Choose a JPEG, PNG, WebP or GIF."

// Returns the file to upload: the original, or a JPEG redrawn on white at
// most 2048px on its longer side. Throws PhotoError with a message for the
// person when the file cannot be used.
export async function preparePhoto(file: File): Promise<File> {
  if (!isPhotoType(file.type)) throw new PhotoError(UNSUPPORTED_PHOTO)

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new PhotoError(UNSUPPORTED_PHOTO)
  }

  const target = photoTargetSize(bitmap.width, bitmap.height, file.size, file.type)
  if (!target) {
    bitmap.close()
    if (file.size > MAX_PHOTO_BYTES) throw new PhotoError("Photos must be 10 MB or smaller.")
    return file
  }

  const canvas = document.createElement("canvas")
  canvas.width = target.width
  canvas.height = target.height
  const context = canvas.getContext("2d")
  if (!context) throw new PhotoError(UNSUPPORTED_PHOTO)
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, target.width, target.height)
  context.drawImage(bitmap, 0, 0, target.width, target.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9))
  if (!blob) throw new PhotoError(UNSUPPORTED_PHOTO)
  if (blob.size > MAX_PHOTO_BYTES) throw new PhotoError("Photos must be 10 MB or smaller.")
  return new File([blob], `${file.name.replace(/\.[^.]*$/, "")}.jpg`, { type: "image/jpeg" })
}
```

`lib/upload-client.ts`:

```ts
import { put } from "@vercel/blob/client"
import type { PhotoPurpose } from "@/lib/media-rules"

export type AuthFetch = (input: string, init?: RequestInit) => Promise<Response>

export const UPLOAD_FAILED = "Upload failed. Try again."

export async function errorFrom(response: Response) {
  const data = await response.json().catch(() => null)
  return typeof data?.error === "string" ? data.error : UPLOAD_FAILED
}

interface UploadOptions {
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

// Uploads a prepared photo (see preparePhoto) straight to Blob and resolves
// to its public URL.
export async function uploadPhoto(
  photo: File,
  purpose: PhotoPurpose,
  authFetch: AuthFetch,
  { onProgress, signal }: UploadOptions = {},
) {
  const response = await authFetch("/api/uploads/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose, contentType: photo.type, size: photo.size }),
    signal,
  })
  if (!response.ok) throw new Error(await errorFrom(response))
  const { pathname, token } = (await response.json()) as { pathname: string; token: string }

  try {
    const blob = await put(pathname, photo, {
      access: "public",
      token,
      contentType: photo.type,
      abortSignal: signal,
      onUploadProgress: ({ percentage }) => onProgress?.(percentage),
    })
    return blob.url
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error(UPLOAD_FAILED)
  }
}
```

`hooks/use-photo-upload.ts`:

```ts
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { preparePhoto } from "@/lib/image-prepare"
import type { PhotoPurpose } from "@/lib/media-rules"
import { UPLOAD_FAILED, uploadPhoto } from "@/lib/upload-client"

export interface PhotoUploadState {
  previewUrl: string | null
  progress: number
  // Set once the photo is stored.
  url: string | null
  error: string | null
}

// Prepares and uploads a chosen photo straight away, tracking its progress.
export function usePhotoUpload(purpose: PhotoPurpose) {
  const { authFetch } = useAuth()
  const [photo, setPhoto] = useState<PhotoUploadState | null>(null)
  const current = useRef<{ abort: AbortController; previewUrl: string | null } | null>(null)

  const clear = useCallback(() => {
    if (current.current) {
      current.current.abort.abort()
      if (current.current.previewUrl) URL.revokeObjectURL(current.current.previewUrl)
    }
    current.current = null
    setPhoto(null)
  }, [])

  const select = useCallback(
    async (file: File) => {
      clear()
      const attempt = { abort: new AbortController(), previewUrl: null as string | null }
      current.current = attempt
      const update = (change: Partial<PhotoUploadState>) => {
        if (current.current === attempt) setPhoto((state) => (state ? { ...state, ...change } : state))
      }
      setPhoto({ previewUrl: null, progress: 0, url: null, error: null })

      try {
        const prepared = await preparePhoto(file)
        attempt.previewUrl = URL.createObjectURL(prepared)
        update({ previewUrl: attempt.previewUrl })
        const url = await uploadPhoto(prepared, purpose, authFetch, {
          signal: attempt.abort.signal,
          onProgress: (progress) => update({ progress }),
        })
        update({ progress: 100, url })
      } catch (error) {
        if (attempt.abort.signal.aborted) return
        update({ error: error instanceof Error ? error.message : UPLOAD_FAILED })
      }
    },
    [authFetch, clear, purpose],
  )

  useEffect(() => clear, [clear])

  return { photo, select, clear }
}
```

`components/media-picker.tsx`:

```tsx
"use client"

import { useRef } from "react"
import { ImageIcon, VideoIcon, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface MediaPickerProps {
  kind: "image" | "video"
  previewUrl: string | null
  // 0-100 while a file is uploading, otherwise null.
  progress: number | null
  // A line under the preview, such as "Uploading 40%" or "Processing video…".
  status: string | null
  error: string | null
  onSelect: (file: File) => void
  onClear: () => void
}

// The choose / preview / progress / change block of the Create form.
export function MediaPicker({ kind, previewUrl, progress, status, error, onSelect, onClear }: MediaPickerProps) {
  const input = useRef<HTMLInputElement>(null)
  const Icon = kind === "image" ? ImageIcon : VideoIcon

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept={kind === "image" ? "image/*" : "video/*"}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Lets the same file be chosen again after removing it.
          event.target.value = ""
          if (file) onSelect(file)
        }}
      />
      {previewUrl ? (
        <div className="relative overflow-hidden rounded-lg border bg-muted">
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
            <img src={previewUrl} alt="Chosen photo" className="max-h-96 w-full object-contain" />
          ) : (
            <video src={previewUrl} className="max-h-96 w-full" muted playsInline controls />
          )}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute right-2 top-2"
            onClick={onClear}
            aria-label={kind === "image" ? "Remove photo" : "Remove video"}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-muted-foreground transition-colors hover:bg-muted/50"
        >
          <Icon className="h-8 w-8" />
          <span className="font-medium">{kind === "image" ? "Choose photo" : "Choose video"}</span>
        </button>
      )}
      {progress !== null && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {previewUrl && (
        <Button type="button" variant="link" className="h-auto p-0" onClick={() => input.current?.click()}>
          Change
        </Button>
      )}
    </div>
  )
}
```

`components/avatar-upload.tsx`:

```tsx
"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { preparePhoto } from "@/lib/image-prepare"
import { UPLOAD_FAILED, uploadPhoto } from "@/lib/upload-client"

// "Upload photo" for the profile picture: uploads the chosen file and hands
// back its URL; saving the profile stores it.
export function AvatarUpload({ onUploaded }: { onUploaded: (url: string) => void }) {
  const { authFetch } = useAuth()
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File) => {
    setError(null)
    setProgress(0)
    try {
      onUploaded(await uploadPhoto(await preparePhoto(file), "avatar", authFetch, { onProgress: setProgress }))
    } catch (err) {
      setError(err instanceof Error ? err.message : UPLOAD_FAILED)
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) upload(file)
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="max-md:h-11"
        disabled={progress !== null}
        onClick={() => input.current?.click()}
      >
        {progress !== null ? `Uploading ${Math.round(progress)}%` : "Upload photo"}
      </Button>
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 6: Use them in the Create form and Edit Profile**

In `components/create-post-form.tsx`:

Add imports:

```tsx
import { MediaPicker } from "@/components/media-picker"
import { usePhotoUpload } from "@/hooks/use-photo-upload"
```

Add after the existing `useState` lines:

```tsx
  const { photo, select: selectPhoto, clear: clearPhoto } = usePhotoUpload("post")
  const photoBusy = photo !== null && photo.url === null && photo.error === null
```

Replace the image check at the top of `handleSubmit`:

```tsx
      if (activeTab === "image" && !imageUrl) {
        setError("Image URL is required for image posts")
        toast.error("Image URL is required for image posts")
        setIsSubmitting(false)
        return
      }
```

with:

```tsx
      const image = photo?.url || imageUrl.trim()
      if (activeTab === "image" && !image) {
        setError("Choose a photo or paste an image link")
        setIsSubmitting(false)
        return
      }
```

and in the `createPost({...})` call change `image: activeTab === "image" ? imageUrl : undefined,` to `image: activeTab === "image" ? image : undefined,`.

Replace the whole image `<TabsContent value="image" …>…</TabsContent>` with:

```tsx
              <TabsContent value="image" className="mt-4 space-y-4">
                <MediaPicker
                  kind="image"
                  previewUrl={photo?.previewUrl ?? null}
                  progress={photoBusy && photo ? photo.progress : null}
                  status={photo?.url ? "Photo ready" : photoBusy && photo?.previewUrl ? `Uploading ${Math.round(photo.progress)}%` : null}
                  error={photo?.error ?? null}
                  onSelect={(file) => {
                    setImageUrl("")
                    selectPhoto(file)
                  }}
                  onClear={clearPhoto}
                />
                <div className="space-y-2">
                  <Label htmlFor="imageUrl">Or paste an image link</Label>
                  <Input
                    id="imageUrl"
                    type="url"
                    placeholder="https://example.com/image.jpg"
                    value={imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value)
                      if (e.target.value) clearPhoto()
                    }}
                  />
                </div>
              </TabsContent>
```

Change the submit button to stay disabled while a photo uploads:

```tsx
            <Button type="submit" disabled={isSubmitting || (activeTab === "image" && photoBusy)} className="mt-4 w-full">
              {isSubmitting ? "Posting..." : "Post"}
            </Button>
```

and change the card description to `Share a photo, a video or a code snippet with your followers`.

In `components/edit-profile-form.tsx`, add the import:

```tsx
import { AvatarUpload } from "@/components/avatar-upload"
```

and after `<p className="text-sm font-medium">{user.username}</p>` add:

```tsx
              <AvatarUpload onUploaded={(url) => setFormData((prev) => ({ ...prev, avatar: url }))} />
```

- [ ] **Step 7: Run the phone check to see it pass**

Run: `npm run typecheck && SMOKE_BASE_URL=http://localhost:3210 npm run mobile-check`
Expected: typecheck exit 0; the phone check ends `N checks, 0 failed`, including every `[photo upload]` and `[profile picture upload]` check; cleanup reports `files=` at least 2.

- [ ] **Step 8: Lint and commit**

Run: `npm run lint`
Expected: 0 errors.

```bash
git add lib/image-prepare.ts lib/upload-client.ts hooks/use-photo-upload.ts components/media-picker.tsx components/avatar-upload.tsx components/create-post-form.tsx components/edit-profile-form.tsx scripts/lib/browser.mjs scripts/mobile-check.mjs scripts/fixtures/wide-3000x1500.png scripts/fixtures/not-a-photo.heic
git commit -F - <<'EOF'
Choose a photo from the device for posts and profile pictures

Photos are shrunk in the browser to 2048px when they are bigger than
that or 2 MB, uploaded straight to Blob with progress, and previewed.
Paste-a-link stays as an alternative.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 8: Choose a video on the Create screen (wait, then post)

**Files:**
- Create: `hooks/use-video-upload.ts`
- Modify: `lib/upload-client.ts`, `components/create-post-form.tsx`, `scripts/mobile-check.mjs`

**Interfaces:**
- Consumes: `POST /api/uploads/video`, `GET /api/uploads/video/:id` (Task 5); `POST /api/posts` with `videoUploadId` (Task 6); `MediaPicker` and `UPLOAD_FAILED`, `errorFrom`, `AuthFetch` (Task 7); `MAX_VIDEO_BYTES`, `MAX_VIDEO_SECONDS` (Task 2).
- Produces:
  - `lib/upload-client.ts`: `requestVideoUpload(authFetch, signal?): Promise<{ uploadId: string; url: string }>`, `getVideoStatus(uploadId, authFetch, signal?): Promise<{ status: "uploading" | "processing" | "ready" | "failed"; playbackId?: string; aspectRatio?: string; duration?: number }>`, `readVideoDuration(file: File): Promise<number | null>`
  - `hooks/use-video-upload.ts`: `useVideoUpload(): { video: VideoUploadState | null; select(file: File): Promise<void>; clear(): void }` with `VideoUploadState { previewUrl: string; phase: "uploading" | "processing" | "ready" | "failed"; progress: number; uploadId: string | null; error: string | null }`

- [ ] **Step 1: Write the failing phone checks**

In `scripts/mobile-check.mjs`, insert this block right after the photo block from Task 7 (still before `console.log("\n[small phone]")`):

```js
    console.log("\n[video upload]")
    if (!process.env.MUX_TOKEN_ID) {
      console.log("  skip video upload (MUX_TOKEN_ID is not set)")
    } else {
      await open(page, "/create")
      await page.evaluate(click(`[...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent.includes("Video"))`))
      await sleep(300)
      const chooser = await page.evaluate(buttonHeight("Choose video"))
      check(`create: the Choose video button is at least ${TAP_TARGET}px tall`, chooser >= TAP_TARGET, `height ${chooser}px`)

      await page.setInputFiles('main input[type="file"][accept^="video"]', [fixture("clip-2s.mp4")])
      const caption = `phone video ${run}`
      await page.type("#caption", caption)
      // An impatient double press while the video is still uploading.
      await page.evaluate(`(() => {
        const post = [...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "Post")
        post.click()
        post.click()
      })()`)
      check(
        "create: Post waits while the video is processed",
        await page.waitFor(`[...document.querySelectorAll("main button")].some((b) => b.textContent.includes("Processing video"))`, { timeout: 10000 }),
      )
      const posted = await page.waitFor(`location.pathname === "/"`, { timeout: 180000 })
      check("create: the video posts itself once it is ready", posted)
      await sleep(1000)
      const copies = await page.evaluate(
        `[...document.querySelectorAll("main p")].filter((p) => p.textContent.includes(${JSON.stringify(caption)})).length`,
      )
      check("create: pressing Post twice makes one post", copies === 1, `${copies} posts`)
    }
```

- [ ] **Step 2: Run the phone check to see it fail**

Run: `SMOKE_BASE_URL=http://localhost:3210 npm run mobile-check`
Expected: FAIL: `Choose video` height 0, then `the check stopped early -- no element matches main input[type="file"][accept^="video"]`.

- [ ] **Step 3: Add the video client functions**

Append to `lib/upload-client.ts`:

```ts
export interface VideoStatus {
  status: "uploading" | "processing" | "ready" | "failed"
  playbackId?: string
  aspectRatio?: string
  duration?: number
}

// Asks the app for a one-time Mux address to upload a video to.
export async function requestVideoUpload(authFetch: AuthFetch, signal?: AbortSignal) {
  const response = await authFetch("/api/uploads/video", { method: "POST", signal })
  if (!response.ok) throw new Error(await errorFrom(response))
  return (await response.json()) as { uploadId: string; url: string }
}

export async function getVideoStatus(uploadId: string, authFetch: AuthFetch, signal?: AbortSignal) {
  const response = await authFetch(`/api/uploads/video/${uploadId}`, { signal })
  if (!response.ok) throw new Error(await errorFrom(response))
  return (await response.json()) as VideoStatus
}

// The video's length in seconds, or null when this browser cannot read it.
// Some phone formats only Mux can read; the server checks the length again.
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    const url = URL.createObjectURL(file)
    const done = (seconds: number | null) => {
      URL.revokeObjectURL(url)
      resolve(seconds)
    }
    video.preload = "metadata"
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null)
    video.onerror = () => done(null)
    video.src = url
  })
}
```

- [ ] **Step 4: Write the video upload hook**

`hooks/use-video-upload.ts`:

```ts
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from "@/lib/media-rules"
import { UPLOAD_FAILED, getVideoStatus, readVideoDuration, requestVideoUpload } from "@/lib/upload-client"

const POLL_MS = 2000
const PROCESSING_LIMIT_MS = 5 * 60 * 1000

export type VideoPhase = "uploading" | "processing" | "ready" | "failed"

export interface VideoUploadState {
  previewUrl: string
  phase: VideoPhase
  progress: number
  uploadId: string | null
  error: string | null
}

// Uploads a chosen video to Mux straight away, then waits until Mux has
// processed it. Choosing again, clearing or leaving the page cancels it.
export function useVideoUpload() {
  const { authFetch } = useAuth()
  const [video, setVideo] = useState<VideoUploadState | null>(null)
  const current = useRef<{ cancel: () => void; previewUrl: string } | null>(null)

  const clear = useCallback(() => {
    if (current.current) {
      current.current.cancel()
      URL.revokeObjectURL(current.current.previewUrl)
    }
    current.current = null
    setVideo(null)
  }, [])

  const select = useCallback(
    async (file: File) => {
      clear()
      const abort = new AbortController()
      let chunks: { abort: () => void } | null = null
      let timer: ReturnType<typeof setTimeout> | undefined
      const attempt = {
        previewUrl: URL.createObjectURL(file),
        cancel: () => {
          abort.abort()
          chunks?.abort()
          clearTimeout(timer)
        },
      }
      current.current = attempt
      const update = (change: Partial<VideoUploadState>) => {
        if (current.current === attempt) setVideo((state) => (state ? { ...state, ...change } : state))
      }
      const fail = (error: string) => update({ phase: "failed", error })
      setVideo({ previewUrl: attempt.previewUrl, phase: "uploading", progress: 0, uploadId: null, error: null })

      if (!file.type.startsWith("video/")) return fail("Choose a video file.")
      if (file.size > MAX_VIDEO_BYTES) return fail("Videos must be 200 MB or smaller.")
      const seconds = await readVideoDuration(file)
      if (current.current !== attempt) return
      if (seconds !== null && seconds > MAX_VIDEO_SECONDS) return fail("Videos can be at most 2 minutes long.")

      try {
        const { uploadId, url } = await requestVideoUpload(authFetch, abort.signal)
        update({ uploadId })
        const { createUpload } = await import("@mux/upchunk")
        if (current.current !== attempt) return
        const upload = createUpload({ endpoint: url, file, chunkSize: 5120 })
        chunks = upload
        upload.on("progress", (event) => update({ progress: Number(event.detail) }))
        upload.on("error", () => fail(UPLOAD_FAILED))
        upload.on("success", () => {
          update({ phase: "processing", progress: 100 })
          const started = Date.now()
          const poll = async () => {
            if (current.current !== attempt) return
            try {
              const { status } = await getVideoStatus(uploadId, authFetch, abort.signal)
              if (status === "ready") return update({ phase: "ready" })
              if (status === "failed") return fail("This video couldn't be processed. Try another file.")
            } catch {
              if (abort.signal.aborted) return
            }
            if (Date.now() - started > PROCESSING_LIMIT_MS) return fail("Processing is taking too long. Try again later.")
            timer = setTimeout(poll, POLL_MS)
          }
          poll()
        })
      } catch {
        if (!abort.signal.aborted) fail(UPLOAD_FAILED)
      }
    },
    [authFetch, clear],
  )

  useEffect(() => clear, [clear])

  return { video, select, clear }
}
```

- [ ] **Step 5: Use it in the Create form**

In `components/create-post-form.tsx`:

Change the React import to `import { useCallback, useEffect, useRef, useState } from "react"`, and add:

```tsx
import { useVideoUpload } from "@/hooks/use-video-upload"
import type { NewPost } from "@/contexts/posts-context"
import { UPLOAD_FAILED } from "@/lib/upload-client"
```

Add after the photo hook lines:

```tsx
  const { video: upload, select: selectVideo, clear: clearVideo } = useVideoUpload()
  // Post was pressed before the video was ready: publish as soon as it is.
  const [publishWhenReady, setPublishWhenReady] = useState(false)
  const publishing = useRef(false)

  const publish = useCallback(
    async (data: NewPost) => {
      if (publishing.current) return
      publishing.current = true
      setIsSubmitting(true)
      try {
        const promise = createPost(data)
        toast.promise(promise, {
          loading: "Creating your post...",
          success: "Post created successfully!",
          error: (err) => `Failed to create post: ${err.message}`,
        })
        await promise
        router.push("/")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create post")
        publishing.current = false
      } finally {
        setIsSubmitting(false)
      }
    },
    [createPost, router],
  )

  useEffect(() => {
    if (!publishWhenReady || !upload) return
    if (upload.phase === "ready" && upload.uploadId) {
      setPublishWhenReady(false)
      publish({ caption, videoUploadId: upload.uploadId })
    } else if (upload.phase === "failed") {
      setPublishWhenReady(false)
      setError(upload.error || UPLOAD_FAILED)
    }
  }, [publishWhenReady, upload, caption, publish])
```

Replace the whole `handleSubmit` function with one that posts every kind through `publish`, so the double-press guard covers them all:

```tsx
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (activeTab === "image") {
      const image = photo?.url || imageUrl.trim()
      if (!image) return setError("Choose a photo or paste an image link")
      return publish({ caption, image })
    }
    if (activeTab === "video") {
      if (upload) {
        if (upload.phase === "failed") return setError(upload.error || UPLOAD_FAILED)
        if (upload.phase !== "ready" || !upload.uploadId) return setPublishWhenReady(true)
        return publish({ caption, videoUploadId: upload.uploadId })
      }
      if (!videoUrl.trim()) return setError("Choose a video or paste a video link")
      return publish({ caption, video: videoUrl.trim() })
    }
    if (!code) return setError("Code is required for code posts")
    return publish({ caption, code, language })
  }
```

Replace the whole video `<TabsContent value="video" …>…</TabsContent>` with:

```tsx
              <TabsContent value="video" className="mt-4 space-y-4">
                <MediaPicker
                  kind="video"
                  previewUrl={upload?.previewUrl ?? null}
                  progress={upload?.phase === "uploading" ? upload.progress : null}
                  status={
                    upload?.phase === "uploading"
                      ? `Uploading ${Math.round(upload.progress)}%`
                      : upload?.phase === "processing"
                        ? "Processing video…"
                        : upload?.phase === "ready"
                          ? "Video ready"
                          : null
                  }
                  error={upload?.error ?? null}
                  onSelect={(file) => {
                    setVideoUrl("")
                    selectVideo(file)
                  }}
                  onClear={() => {
                    setPublishWhenReady(false)
                    clearVideo()
                  }}
                />
                <div className="space-y-2">
                  <Label htmlFor="videoUrl">Or paste a YouTube, Vimeo or video link</Label>
                  <Input
                    id="videoUrl"
                    type="url"
                    placeholder="https://youtu.be/…"
                    value={videoUrl}
                    onChange={(e) => {
                      setVideoUrl(e.target.value)
                      if (e.target.value) clearVideo()
                    }}
                  />
                </div>
              </TabsContent>
```

Replace the submit button with:

```tsx
            <Button
              type="submit"
              disabled={isSubmitting || publishWhenReady || (activeTab === "image" && photoBusy)}
              className="mt-4 w-full"
            >
              {isSubmitting ? "Posting..." : publishWhenReady ? "Processing video…" : "Post"}
            </Button>
```

- [ ] **Step 6: Run the phone check to see it pass**

Run: `npm run typecheck && SMOKE_BASE_URL=http://localhost:3210 npm run mobile-check`
Expected: exit 0; `N checks, 0 failed` including every `[video upload]` check; cleanup reports `videos=` at least 1.

- [ ] **Step 7: Lint and commit**

Run: `npm run lint`
Expected: 0 errors.

```bash
git add lib/upload-client.ts hooks/use-video-upload.ts components/create-post-form.tsx scripts/mobile-check.mjs
git commit -F - <<'EOF'
Choose a video from the device and post it once Mux has it ready

The upload starts as soon as a video is chosen. Pressing Post before Mux
has finished shows "Processing video…" and publishes automatically when
the video is ready; repeated presses make one post.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 9: Play uploaded videos and show their thumbnails

**Files:**
- Create: `components/mux-video.tsx`, `lib/media-urls.ts`
- Modify: `components/post.tsx`, `components/post-detail.tsx`, `components/explore-post.tsx`, `components/profile-post.tsx`, `scripts/mobile-check.mjs`

**Interfaces:**
- Consumes: `PostType.muxVideo` (Task 6); fixtures and helpers from Tasks 5 and 7.
- Produces: `MuxVideo({ playbackId: string; aspectRatio?: string; title?: string })`; `muxThumbnailUrl(playbackId: string, width: number): string`.

- [ ] **Step 1: Write the failing phone checks**

In `scripts/mobile-check.mjs`, add `import { readFile } from "node:fs/promises"` to the imports. At the end of `seed()`, before `return`, add:

```js
  // A posted Mux video, for the playback and thumbnail checks.
  let videoPostId = null
  if (process.env.MUX_TOKEN_ID) {
    const { uploadId, url } = await api("POST", "/api/uploads/video", a.token)
    const put = await fetch(url, { method: "PUT", body: await readFile(fixture("clip-2s.mp4")) })
    if (!put.ok) throw new Error(`upload to Mux answered ${put.status}`)
    for (let attempt = 0; attempt < 60; attempt++) {
      const { status } = await api("GET", `/api/uploads/video/${uploadId}`, a.token)
      if (status === "ready") break
      if (status === "failed") throw new Error("Mux could not process the test clip")
      await sleep(2000)
    }
    videoPostId = (await api("POST", "/api/posts", a.token, { caption: `vertical video ${run}`, videoUploadId: uploadId }))._id
  }
```

and change the return to `return { a, b, postId: code._id, videoPostId }`. In `main()`, change `const { a, postId } = await seed()` to `const { a, postId, videoPostId } = await seed()`, and insert this block before `console.log("\n[photo upload]")`:

```js
    console.log("\n[video playback]")
    if (!videoPostId) {
      console.log("  skip video playback (MUX_TOKEN_ID is not set)")
    } else {
      await open(page, "/")
      check("home: an uploaded video shows a player", await page.waitFor(`document.querySelector("main mux-player")`, { timeout: 15000 }))
      await open(page, "/explore")
      check(
        "explore: an uploaded video shows its thumbnail",
        await page.waitFor(`[...document.querySelectorAll("main img")].some((img) => img.src.startsWith("https://image.mux.com/"))`, { timeout: 15000 }),
      )
      await open(page, `/p/${videoPostId}`)
      await page.waitFor(`document.querySelector("main mux-player")`, { timeout: 15000 })
      const player = await page.evaluate(`(() => {
        const box = document.querySelector("main mux-player")?.getBoundingClientRect()
        return box ? { width: box.width, height: box.height } : null
      })()`)
      check("post: a vertical video keeps its vertical shape", player !== null && player.height > player.width, JSON.stringify(player))
      const shell = await page.evaluate(SHELL)
      check("post: a video page fits the width of the screen", fitsScreen(shell, PHONE), widthDetail(shell, PHONE))
    }
```

- [ ] **Step 2: Run the phone check to see it fail**

Run: `SMOKE_BASE_URL=http://localhost:3210 npm run mobile-check`
Expected: FAIL on `home: an uploaded video shows a player`, `explore: an uploaded video shows its thumbnail` and `post: a vertical video keeps its vertical shape`.

- [ ] **Step 3: Write the player and thumbnail helpers**

`lib/media-urls.ts`:

```ts
// A still from a Mux video, for grids.
export function muxThumbnailUrl(playbackId: string, width: number) {
  return `https://image.mux.com/${playbackId}/thumbnail.webp?width=${width}`
}
```

`components/mux-video.tsx`:

```tsx
"use client"

import MuxPlayer from "@mux/mux-player-react/lazy"

interface MuxVideoProps {
  playbackId: string
  // As Mux reports it, for example "9:16".
  aspectRatio?: string
  title?: string
}

function cssAspectRatio(ratio?: string) {
  const match = ratio?.match(/^(\d+):(\d+)$/)
  return match ? `${match[1]} / ${match[2]}` : "16 / 9"
}

// An uploaded video. The player's code loads only when a page shows one.
export function MuxVideo({ playbackId, aspectRatio, title }: MuxVideoProps) {
  return (
    <MuxPlayer
      playbackId={playbackId}
      streamType="on-demand"
      accentColor="#18181b"
      metadataVideoTitle={title}
      style={{ width: "100%", aspectRatio: cssAspectRatio(aspectRatio), maxHeight: "80dvh" }}
    />
  )
}
```

- [ ] **Step 4: Show uploaded videos on posts and in grids**

In `components/post.tsx`, add `import { MuxVideo } from "@/components/mux-video"` and replace

```tsx
        ) : post.video ? (
          <VideoPlayer url={post.video} />
```

with

```tsx
        ) : post.muxVideo ? (
          <MuxVideo playbackId={post.muxVideo.playbackId} aspectRatio={post.muxVideo.aspectRatio} title={post.caption} />
        ) : post.video ? (
          <VideoPlayer url={post.video} />
```

In `components/post-detail.tsx`, add the imports:

```tsx
import { MuxVideo } from "@/components/mux-video"
import { muxThumbnailUrl } from "@/lib/media-urls"
```

after `{post.video && <VideoPlayer url={post.video} className="w-full" />}` add:

```tsx
          {post.muxVideo && (
            <MuxVideo playbackId={post.muxVideo.playbackId} aspectRatio={post.muxVideo.aspectRatio} title={post.caption} />
          )}
```

and in the similar-posts grid replace

```tsx
                ) : similarPost.code ? (
```

with

```tsx
                ) : similarPost.muxVideo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Mux thumbnail
                  <img src={muxThumbnailUrl(similarPost.muxVideo.playbackId, 320)} alt="Video thumbnail" className="h-full w-full object-cover" />
                ) : similarPost.code ? (
```

In `components/explore-post.tsx` and `components/profile-post.tsx`, change the lucide import to add `Play`, add `import { muxThumbnailUrl } from "@/lib/media-urls"`, and replace

```tsx
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-50">
```

with

```tsx
      ) : post.muxVideo ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- Mux thumbnail */}
          <img
            src={muxThumbnailUrl(post.muxVideo.playbackId, 480)}
            alt="Video thumbnail"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
          <Play className="absolute right-2 top-2 h-5 w-5 fill-white text-white drop-shadow" />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-50">
```

- [ ] **Step 5: Run the phone check to see it pass**

Run: `npm run typecheck && SMOKE_BASE_URL=http://localhost:3210 npm run mobile-check`
Expected: exit 0; `N checks, 0 failed` including every `[video playback]` check.

- [ ] **Step 6: Lint, build and commit**

Run: `npm run lint && npm run build`
Expected: 0 errors; build exit 0.

```bash
git add components/mux-video.tsx lib/media-urls.ts components/post.tsx components/post-detail.tsx components/explore-post.tsx components/profile-post.tsx scripts/mobile-check.mjs
git commit -F - <<'EOF'
Play uploaded videos with Mux Player and show their thumbnails

Videos keep their shape, vertical ones included, and the player's code
loads only on pages that show a video.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 10: Documentation and full verification

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-10-14-media-uploads-design.md`

- [ ] **Step 1: Update the README**

In `README.md`:

- Under Features, replace `- Feed of image, video and syntax-highlighted code posts` with `- Feed of photo, video and syntax-highlighted code posts; photos and videos upload from your device (or paste a link)`.
- Under Getting started, replace the `.env.local` block and the line after it with:

````markdown
```bash
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=a_long_random_string
BLOB_READ_WRITE_TOKEN=from_vercel_blob
MUX_TOKEN_ID=from_mux
MUX_TOKEN_SECRET=from_mux
MUX_TEST_UPLOADS=1
```

`JWT_SECRET` signs login tokens. Generate one with `openssl rand -hex 32`. `MUX_TEST_UPLOADS=1` is for local work only: Mux then makes free test videos (watermarked, cut to 10 seconds, deleted after a day).
````

- Add a section after "Installable app (PWA)":

````markdown
## Photo and video uploads

Photos (post images and profile pictures) go to [Vercel Blob](https://vercel.com/docs/vercel-blob); videos go to [Mux](https://www.mux.com). The browser uploads straight to them with short-lived credentials from `/api/uploads/*`, so files never pass through a Vercel Function.

Setup for a new deployment:

1. `vercel blob create-store devgram-media --access public --environment production --environment preview --yes`
2. `vercel blob create-store devgram-media-dev --access public --environment development --yes` (a separate store for local work)
3. `vercel integration add mux`, then finish connecting Mux in the Vercel dashboard if it asks.
4. Copy `BLOB_READ_WRITE_TOKEN`, `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` from `vercel env pull some-file --environment=development` into `.env.local`. Don't pull straight onto `.env.local`: that replaces the whole file.

Limits: photos up to 10 MB (JPEG, PNG, WebP, GIF), shrunk in the browser to 2048px when bigger than that or 2 MB; videos up to 2 minutes and 200 MB. Deleting a post deletes its uploaded photo or video, and changing your profile picture deletes the old upload.
````

- In the Scripts table add `| npm run test:unit | unit tests for the upload rules |`, and after the paragraph about `SMOKE_DB` add: `The smoke test's photos and videos sections, and the phone check's upload checks, upload real files and remove them through the Blob and Mux keys in .env.local. They skip themselves when those keys are missing; run them only against a server that uses the same Blob store and Mux account.`
- Under "Not yet built", remove the image/avatar upload line.

- [ ] **Step 2: Note the second known gap in the spec**

In the spec's Known gaps, after the first bullet, add:

```markdown
- A photo uploaded on the Create screen or in Settings that is never posted or saved stays in its owner's Blob folder.
```

- [ ] **Step 3: Run every check on the dev server**

Run, one after another: `npm run test:unit`, `npm run typecheck`, `npm run lint`, `SMOKE_BASE_URL=http://localhost:3210 npm run smoke`, `SMOKE_BASE_URL=http://localhost:3210 npm run mobile-check`
Expected: unit `fail 0`; typecheck exit 0; lint 0 errors; smoke `N checks, 0 failed`; phone check `N checks, 0 failed`.

- [ ] **Step 4: Run them on a production build**

Stop the dev server, then:

```bash
npm run build
npx next start -p 3210 > /tmp/devgram-prod.log 2>&1 &
for i in $(seq 1 60); do curl -s -o /dev/null -m 5 http://localhost:3210/api/health && break; sleep 1; done
SMOKE_BASE_URL=http://localhost:3210 npm run smoke
SMOKE_BASE_URL=http://localhost:3210 npm run mobile-check
lsof -ti tcp:3210 -sTCP:LISTEN | xargs kill
```

Expected: build exit 0; both suites `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/specs/2026-10-14-media-uploads-design.md
git commit -F - <<'EOF'
Document photo and video uploads

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```
