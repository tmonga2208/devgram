import { after, test } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import "./app-alias.mjs"

// A Mux API that takes requests and never answers them.
const silent = createServer(() => {})
await new Promise((resolve) => silent.listen(0, "127.0.0.1", resolve))
after(() => {
  silent.closeAllConnections()
  silent.close()
})

process.env.MUX_BASE_URL = `http://127.0.0.1:${silent.address().port}`
process.env.MUX_TOKEN_ID = "test-id"
process.env.MUX_TOKEN_SECRET = "test-secret"

const { deleteVideoAsset } = await import("../../lib/mux.ts")

test("gives up on a video delete that Mux doesn't answer, and logs it", { timeout: 15_000 }, async (t) => {
  const logged = t.mock.method(console, "error", () => {})
  const started = Date.now()
  await deleteVideoAsset("abc123assetid")
  assert.ok(Date.now() - started < 10_000, "the delete should give up within 10 seconds")
  assert.equal(logged.mock.calls[0]?.arguments[0], "Could not delete video")
})
