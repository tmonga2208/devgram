import { after, test } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import "./app-alias.mjs"

// A Blob API that takes requests and never answers them.
const silent = createServer(() => {})
await new Promise((resolve) => silent.listen(0, "127.0.0.1", resolve))
after(() => {
  silent.closeAllConnections()
  silent.close()
})

process.env.VERCEL_BLOB_API_URL = `http://127.0.0.1:${silent.address().port}`
process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teststore_secret"
delete process.env.BLOB_STORE_ID
// An unexpired stand-in, so the SDK doesn't fetch a real OIDC token through
// the Vercel CLI before it falls back to the token above.
const claims = Buffer.from(JSON.stringify({ exp: 4102444800 })).toString("base64url")
process.env.VERCEL_OIDC_TOKEN = `e30.${claims}.x`

const { deleteOwnPhoto } = await import("../../lib/blob.ts")

const USER = "64b7f0c2a1b2c3d4e5f60718"
const PHOTO = `https://teststore.public.blob.vercel-storage.com/posts/${USER}/0f8fad5b-d9cb-469f-a165-70867728950e.jpg`

test("gives up on a photo delete that Blob doesn't answer, and logs it", { timeout: 15_000 }, async (t) => {
  const logged = t.mock.method(console, "error", () => {})
  const started = Date.now()
  await deleteOwnPhoto(PHOTO, "post", USER)
  assert.ok(Date.now() - started < 10_000, "the delete should give up within 10 seconds")
  assert.equal(logged.mock.calls[0]?.arguments[0], "Could not delete photo")
})
