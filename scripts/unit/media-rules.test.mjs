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
