import { test } from "node:test"
import assert from "node:assert/strict"
import {
  DEVBIT_LENGTH,
  DEVBIT_TOO_LONG,
  MAX_VIDEO_SECONDS,
  VIDEO_TOO_LONG,
  isPhotoPurpose,
  isPhotoType,
  ownPhotoUrl,
  photoPath,
  photoTargetSize,
  videoAssetProblem,
} from "../../lib/media-rules.ts"

const USER = "64b7f0c2a1b2c3d4e5f60718"
const OTHER = "64b7f0c2a1b2c3d4e5f60719"
const HOST = "https://abc123.public.blob.vercel-storage.com"
// File names are UUIDs, as crypto.randomUUID() makes them.
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e"

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
  assert.equal(ownPhotoUrl(`${HOST}/posts/${USER}/${ID}.jpg`, "post", USER), `${HOST}/posts/${USER}/${ID}.jpg`)
  assert.equal(ownPhotoUrl(`${HOST}/avatars/${USER}/${ID}.png`, "avatar", USER), `${HOST}/avatars/${USER}/${ID}.png`)
  assert.equal(ownPhotoUrl(`${HOST}/posts/${OTHER}/${ID}.jpg`, "post", USER), null)
  assert.equal(ownPhotoUrl(`${HOST}/avatars/${USER}/${ID}.jpg`, "post", USER), null)
  assert.equal(ownPhotoUrl(`https://example.com/posts/${USER}/${ID}.jpg`, "post", USER), null)
  assert.equal(ownPhotoUrl(`http://abc123.public.blob.vercel-storage.com/posts/${USER}/${ID}.jpg`, "post", USER), null)
  assert.equal(ownPhotoUrl(`${HOST}/posts/${USER}`, "post", USER), null)
  assert.equal(ownPhotoUrl("/placeholder.svg", "avatar", USER), null)
  assert.equal(ownPhotoUrl(undefined, "avatar", USER), null)
})

test("refuses URLs that only look like they are in the user's folder", () => {
  // URL parsing leaves %2F alone, so this climbs into OTHER's folder once decoded.
  assert.equal(ownPhotoUrl(`${HOST}/posts/${USER}/..%2F${OTHER}%2F${ID}.jpg`, "post", USER), null)
  assert.equal(ownPhotoUrl(`${HOST}/posts/${USER}/notes.txt`, "post", USER), null)
})

test("gives back the plain URL to delete, without a query or a login part", () => {
  const plain = `${HOST}/posts/${USER}/${ID}.webp`
  assert.equal(ownPhotoUrl(`https://me@abc123.public.blob.vercel-storage.com/posts/${USER}/${ID}.webp?download=1#x`, "post", USER), plain)
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
  const asset = {
    status: "ready",
    passthrough: USER,
    duration: MAX_VIDEO_SECONDS,
    playback_ids: [{ id: "p", policy: "public" }],
    tracks: [{ type: "video" }, { type: "audio" }],
  }
  assert.equal(videoAssetProblem(asset, USER), null)
})

test("refuses a ready asset with no picture, which Mux makes from some files that aren't videos", () => {
  const soundOnly = { status: "ready", passthrough: USER, duration: 120, playback_ids: [{ id: "p", policy: "public" }], tracks: [{ type: "audio" }] }
  assert.deepEqual(videoAssetProblem(soundOnly, USER), { status: 400, message: "This video could not be processed" })
})

test("refuses someone else's, unfinished, failed, long and unplayable videos", () => {
  const ready = { status: "ready", passthrough: USER, duration: 10, playback_ids: [{ id: "p", policy: "public" }], tracks: [{ type: "video" }] }
  assert.equal(videoAssetProblem({ ...ready, passthrough: OTHER }, USER)?.status, 404)
  assert.equal(videoAssetProblem({ ...ready, status: "preparing" }, USER)?.status, 409)
  assert.equal(videoAssetProblem({ ...ready, status: "errored" }, USER)?.status, 400)
  assert.deepEqual(videoAssetProblem({ ...ready, duration: MAX_VIDEO_SECONDS + 0.5 }, USER), { status: 400, message: VIDEO_TOO_LONG })
  assert.equal(videoAssetProblem({ ...ready, playback_ids: [{ id: "p", policy: "signed" }] }, USER)?.status, 400)
  assert.equal(videoAssetProblem({ ...ready, playback_ids: undefined }, USER)?.status, 400)
})

test("holds DevBits to 90 seconds, and video posts to 2 minutes", () => {
  const ready = { status: "ready", passthrough: USER, playback_ids: [{ id: "p", policy: "public" }], tracks: [{ type: "video" }] }
  assert.equal(videoAssetProblem({ ...ready, duration: 90 }, USER, DEVBIT_LENGTH), null)
  assert.deepEqual(videoAssetProblem({ ...ready, duration: 90.5 }, USER, DEVBIT_LENGTH), { status: 400, message: DEVBIT_TOO_LONG })
  assert.equal(DEVBIT_TOO_LONG, "DevBits can be at most 90 seconds long")
  assert.equal(videoAssetProblem({ ...ready, duration: 100 }, USER), null)
})
