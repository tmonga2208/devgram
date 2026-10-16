import { test } from "node:test"
import assert from "node:assert/strict"
import "./app-alias.mjs"

process.env.JWT_SECRET = "a-secret-only-these-tests-use"
const { CONNECT_SECONDS, challengeFor, connectCookieOptions, readConnect, returnUrl, startConnect } = await import("../../lib/github-connect.ts")
const { readCookie, signToken } = await import("../../lib/tokens.ts")

test("a connect attempt comes back from its cookie as it went", async () => {
  const { cookie, attempt } = await startConnect("user-1", "/create?tab=code")
  assert.equal(attempt.userId, "user-1")
  assert.equal(attempt.returnTo, "/create?tab=code")
  assert.match(attempt.state, /^[A-Za-z0-9_-]{43}$/)
  assert.match(attempt.verifier, /^[A-Za-z0-9_-]{43}$/)
  assert.deepEqual(await readConnect(cookie), attempt)
  assert.equal(CONNECT_SECONDS, 600)
})

test("each attempt gets its own state and verifier", async () => {
  const one = (await startConnect("u", "/")).attempt
  const two = (await startConnect("u", "/")).attempt
  assert.notEqual(one.state, two.state)
  assert.notEqual(one.verifier, two.verifier)
})

test("a changed cookie, a login token or nothing reads as no attempt", async () => {
  const { cookie } = await startConnect("user-1", "/settings")
  const [header, payload, signature] = cookie.split(".")
  const changed = [header, `${payload.slice(0, 10)}${payload[10] === "A" ? "B" : "A"}${payload.slice(11)}`, signature].join(".")
  assert.equal(await readConnect(changed), null)
  assert.equal(await readConnect(await signToken({ id: "user-1", username: "u", email: "u@example.com" })), null)
  assert.equal(await readConnect(null), null)
  assert.equal(await readConnect("not-a-token"), null)
})

test("only ever returns to a page on this site", async () => {
  assert.equal((await startConnect("u", "//evil.com")).attempt.returnTo, "/settings?tab=account")
  assert.equal((await startConnect("u", null)).attempt.returnTo, "/settings?tab=account")
  assert.equal(
    returnUrl("http://localhost:3210", "/create?tab=code", "connected", "octo").href,
    "http://localhost:3210/create?tab=code&github=connected&github_login=octo",
  )
  assert.equal(returnUrl("http://localhost:3210", "https://evil.com", "error").href, "http://localhost:3210/settings?tab=account&github=error")
})

test("PKCE's challenge is the verifier's SHA-256 in base64url (RFC 7636's example)", () => {
  assert.equal(challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
})

test("the cookie is for the GitHub routes only, never readable by scripts", () => {
  assert.deepEqual(connectCookieOptions(true, 600), { httpOnly: true, sameSite: "lax", secure: true, path: "/api/github", maxAge: 600 })
})

test("reads one cookie out of a request", () => {
  const req = new Request("http://x", { headers: { cookie: "a=1; github_connect=abc.def; token=t%20x" } })
  assert.equal(readCookie(req, "github_connect"), "abc.def")
  assert.equal(readCookie(req, "token"), "t x")
  assert.equal(readCookie(req, "missing"), null)
  assert.equal(readCookie(new Request("http://x"), "token"), null)
})
