import { after, test } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import "./app-alias.mjs"

// A stand-in for GitHub. Each test sets `routes` ("METHOD /path?query" →
// answer); `seen` records the requests that came in.
let routes = {}
const seen = []
const server = createServer((req, res) => {
  const chunks = []
  req.on("data", (chunk) => chunks.push(chunk))
  req.on("end", () => {
    seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() })
    const { status = 200, headers = {}, body = "" } = routes[`${req.method} ${req.url}`] ?? { status: 404, body: { message: "Not Found" } }
    const text = typeof body === "string" ? body : JSON.stringify(body)
    res.writeHead(status, { "content-type": typeof body === "string" ? "text/plain" : "application/json", ...headers })
    res.end(text)
  })
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
after(() => {
  server.closeAllConnections()
  server.close()
})

const BASE = `http://127.0.0.1:${server.address().port}`
process.env.GITHUB_API_URL = BASE
process.env.GITHUB_WEB_URL = BASE
process.env.GITHUB_CLIENT_ID = "test-client"
process.env.GITHUB_CLIENT_SECRET = "test-secret"

const github = await import("../../lib/github.ts")
const { HttpError } = await import("../../lib/http-error.ts")
const messages = await import("../../lib/github-links.ts")
const rules = await import("../../lib/code-files.ts")

const COMMIT = "a".repeat(40)
const BASIC = `Basic ${Buffer.from("test-client:test-secret").toString("base64")}`
const answer = (next) => {
  routes = next
  seen.length = 0
}
const fails = (promise, message, status) =>
  assert.rejects(promise, (error) => {
    assert.ok(error instanceof HttpError, `expected an HttpError, got ${error}`)
    assert.equal(error.message, message)
    assert.equal(error.status, status)
    return true
  })
const repoInfo = () => ({ body: { name: "r", owner: { login: "O" }, default_branch: "main" } })
// The contents API's answer for a file: base64 with a line break every 60 characters, as GitHub sends it.
const contents = (code) => {
  const bytes = Buffer.isBuffer(code) ? code : Buffer.from(code)
  return { body: { type: "file", size: bytes.length, encoding: "base64", content: bytes.toString("base64").replace(/(.{60})/g, "$1\n") } }
}
const source = (path) => ({ owner: "o", repo: "r", commit: COMMIT, path })
const repoLink = { owner: "o", repo: "r", kind: "repo", rest: "", marked: null }

test("reads public data with the app's ID and secret", async () => {
  answer({ "GET /repos/o/r": repoInfo(), "GET /repos/O/r/commits/main": { body: COMMIT } })
  assert.deepEqual(await github.resolveLink(repoLink), { owner: "O", repo: "r", commit: COMMIT, kind: "repo", path: "", marked: null })
  assert.equal(seen[0].headers.authorization, BASIC)
  assert.equal(seen[0].headers["x-github-api-version"], "2022-11-28")
  assert.equal(seen[0].headers["user-agent"], "devgram")
  assert.equal(seen[1].headers.accept, "application/vnd.github.sha")
})

test("finds a branch with a slash in its name, trying the shortest first", async () => {
  answer({
    "GET /repos/o/r": repoInfo(),
    "GET /repos/O/r/commits/feature": { status: 422, body: { message: "No commit found for SHA: feature" } },
    "GET /repos/O/r/commits/feature%2Flogin": { body: COMMIT },
  })
  const link = { owner: "o", repo: "r", kind: "blob", rest: "feature/login/src/app.ts", marked: { from: 2, to: 3 } }
  assert.deepEqual(await github.resolveLink(link), {
    owner: "O", repo: "r", commit: COMMIT, kind: "file", path: "src/app.ts", marked: { from: 2, to: 3 },
  })
  assert.deepEqual(seen.map((request) => request.url), ["/repos/o/r", "/repos/O/r/commits/feature", "/repos/O/r/commits/feature%2Flogin"])
})

test("resolves a folder link at a branch, and a link at a full commit", async () => {
  answer({ "GET /repos/o/r": repoInfo(), "GET /repos/O/r/commits/main": { body: COMMIT }, [`GET /repos/O/r/commits/${COMMIT}`]: { body: COMMIT } })
  assert.deepEqual(await github.resolveLink({ owner: "o", repo: "r", kind: "tree", rest: "main", marked: null }), {
    owner: "O", repo: "r", commit: COMMIT, kind: "folder", path: "", marked: null,
  })
  assert.deepEqual(await github.resolveLink({ owner: "o", repo: "r", kind: "blob", rest: `${COMMIT}/lib/a.ts`, marked: null }), {
    owner: "O", repo: "r", commit: COMMIT, kind: "file", path: "lib/a.ts", marked: null,
  })
})

test("gives up on a link after five tries", async () => {
  answer({ "GET /repos/o/r": repoInfo() })
  await fails(github.resolveLink({ owner: "o", repo: "r", kind: "blob", rest: "a/b/c/d/e/f/g.ts", marked: null }), messages.FILE_NOT_FOUND, 404)
  assert.equal(seen.filter((request) => request.url.includes("/commits/")).length, 5)
  await fails(github.resolveLink({ owner: "o", repo: "r", kind: "tree", rest: "nope/src", marked: null }), messages.FOLDER_NOT_FOUND, 404)
})

test("a repository that doesn't exist or is private", async () => {
  answer({})
  await fails(github.resolveLink(repoLink), messages.REPO_NOT_FOUND, 404)
})

test("says GitHub is busy when the rate limit is used up", async () => {
  for (const limited of [
    { status: 403, headers: { "x-ratelimit-remaining": "0" }, body: { message: "API rate limit exceeded" } },
    { status: 403, headers: { "retry-after": "60" }, body: { message: "You have exceeded a secondary rate limit" } },
    { status: 429, body: { message: "Too Many Requests" } },
  ]) {
    answer({ "GET /repos/o/r": limited })
    await fails(github.resolveLink(repoLink), messages.BUSY, 503)
  }
})

test("says GitHub couldn't be reached when it fails or isn't there", async () => {
  answer({ "GET /repos/o/r": { status: 502, body: "Bad Gateway" } })
  await fails(github.resolveLink(repoLink), messages.UNREACHABLE, 502)
  const closed = createServer()
  await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve))
  const { port } = closed.address()
  await new Promise((resolve) => closed.close(resolve))
  process.env.GITHUB_API_URL = `http://127.0.0.1:${port}`
  try {
    await fails(github.resolveLink(repoLink), messages.UNREACHABLE, 502)
  } finally {
    process.env.GITHUB_API_URL = BASE
  }
})

test("lists a repository's folders and files, leaving out submodules and symlinks", async () => {
  answer({
    [`GET /repos/o/r/git/trees/${COMMIT}?recursive=1`]: {
      body: {
        truncated: false,
        tree: [
          { path: "lib", mode: "040000", type: "tree" },
          { path: "lib/a.ts", mode: "100644", type: "blob", size: 12 },
          { path: "run.sh", mode: "100755", type: "blob", size: 3 },
          { path: "vendor/x", mode: "160000", type: "commit" },
          { path: "latest", mode: "120000", type: "blob", size: 6 },
        ],
      },
    },
  })
  assert.deepEqual(await github.listTree("o", "r", COMMIT), [
    { path: "lib", type: "folder" },
    { path: "lib/a.ts", type: "file", size: 12 },
    { path: "run.sh", type: "file", size: 3 },
  ])
})

test("won't browse a repository GitHub lists only in part, or one too big to send", async () => {
  const tree = `GET /repos/o/r/git/trees/${COMMIT}?recursive=1`
  answer({ [tree]: { body: { truncated: true, tree: [] } } })
  await fails(github.listTree("o", "r", COMMIT), messages.TOO_BIG_TO_BROWSE, 400)
  const huge = Array.from({ length: github.MAX_TREE_ENTRIES + 1 }, (_, i) => ({ path: `f${i}`, mode: "100644", type: "blob", size: 1 }))
  answer({ [tree]: { body: { truncated: false, tree: huge } } })
  await fails(github.listTree("o", "r", COMMIT), messages.TOO_BIG_TO_BROWSE, 400)
})

test("fetches a file's text, with its name, language and line count", async () => {
  const code = "export const a = 1\r\nexport const b = 2\r\n"
  answer({ [`GET /repos/o/r/contents/lib/app.ts?ref=${COMMIT}`]: contents(code) })
  assert.deepEqual(await github.fetchGitHubFile(source("lib/app.ts")), {
    name: "app.ts", language: "typescript", code, lineCount: 2, github: source("lib/app.ts"),
  })
})

test("encodes each part of a path, and starts files no language claims as Plain text", async () => {
  answer({ [`GET /repos/o/r/contents/docs/Getting%20Started/%E6%97%A5%E6%9C%AC?ref=${COMMIT}`]: contents("notes") })
  const file = await github.fetchGitHubFile(source("docs/Getting Started/日本"))
  assert.equal(file.name, "日本")
  assert.equal(file.language, "text")
})

test("refuses folders, links, missing, binary, empty and oversized files", async () => {
  const route = `GET /repos/o/r/contents/x?ref=${COMMIT}`
  const cases = [
    [{ body: [{ name: "a.ts", type: "file" }] }, messages.FILE_NOT_FOUND, 404],
    [{ body: { type: "symlink", size: 4, target: "a.ts" } }, messages.FILE_NOT_FOUND, 404],
    [{ status: 404, body: { message: "Not Found" } }, messages.FILE_NOT_FOUND, 404],
    [contents(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])), messages.NOT_TEXT, 400],
    [contents(Buffer.from([0x61, 0xff, 0xfe, 0x62])), messages.NOT_TEXT, 400],
    [contents(" \n\t\n"), rules.EMPTY_FILE, 400],
    [contents("x".repeat(100001)), rules.GITHUB_FILE_TOO_LONG, 400],
    [{ body: { type: "file", size: 300001, encoding: "base64", content: "" } }, rules.GITHUB_FILE_TOO_LONG, 400],
    [{ body: { type: "file", size: 2000000, encoding: "none", content: "" } }, rules.GITHUB_FILE_TOO_LONG, 400],
  ]
  for (const [response, message, status] of cases) {
    answer({ [route]: response })
    await fails(github.fetchGitHubFile(source("x")), message, status)
  }
  answer({ [route]: contents("é".repeat(100000)) })
  assert.equal((await github.fetchGitHubFile(source("x"))).code.length, 100000, "100,000 two-byte characters are within the limit")
})

test("fills a post's GitHub files with GitHub's code, leaving written files alone", async () => {
  answer({ [`GET /repos/o/r/contents/lib/app.ts?ref=${COMMIT}`]: contents("the real code\n") })
  const written = { name: "notes.txt", language: "text", code: "mine" }
  const filled = await github.fillGitHubFiles([
    { name: "app.ts", language: "typescript", code: "not what GitHub has", github: source("lib/app.ts"), marked: { from: 1, to: 1 } },
    written,
  ])
  assert.deepEqual(filled, [
    { name: "app.ts", language: "typescript", code: "the real code\n", github: source("lib/app.ts"), marked: { from: 1, to: 1 } },
    written,
  ])
  await fails(github.fillGitHubFiles([{ name: "a.ts", language: "typescript", github: { ...source("a.ts"), commit: "main" } }]), rules.BAD_SOURCE, 400)
  answer({})
  for (const value of ["a.ts", [], Array.from({ length: 6 }, () => ({ github: source("a.ts") }))]) {
    assert.deepEqual(await github.fillGitHubFiles(value), value)
  }
  assert.equal(seen.length, 0, "lists the rules refuse anyway aren't fetched")
})

test("lists someone's public repositories", async () => {
  answer({
    "GET /users/someone/repos?type=owner&sort=pushed&per_page=100": {
      body: [{ name: "r", owner: { login: "someone" }, description: null, language: "Go", default_branch: "trunk", private: false }],
    },
  })
  assert.deepEqual(await github.listRepos("someone"), [{ owner: "someone", name: "r", description: "", language: "Go", defaultBranch: "trunk" }])
  answer({})
  await fails(github.listRepos("renamed"), messages.ACCOUNT_GONE, 404)
})

test("says GitHub isn't set up without the app's ID and secret", async () => {
  const id = process.env.GITHUB_CLIENT_ID
  delete process.env.GITHUB_CLIENT_ID
  try {
    assert.equal(github.isGitHubSetUp(), false)
    await fails(github.fetchGitHubFile(source("a.ts")), messages.NOT_SET_UP, 503)
    assert.throws(() => github.authorizeUrl({ state: "s", challenge: "c", redirectUri: "http://x/cb" }), (error) => error.message === messages.NOT_SET_UP)
  } finally {
    process.env.GITHUB_CLIENT_ID = id
  }
  assert.equal(github.isGitHubSetUp(), true)
})

test("connecting: GitHub's sign-in page asks for no scopes", () => {
  const url = new URL(github.authorizeUrl({ state: "the-state", challenge: "the-challenge", redirectUri: "http://localhost:3210/api/github/callback" }))
  assert.equal(`${url.origin}${url.pathname}`, `${BASE}/login/oauth/authorize`)
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    client_id: "test-client",
    redirect_uri: "http://localhost:3210/api/github/callback",
    state: "the-state",
    code_challenge: "the-challenge",
    code_challenge_method: "S256",
    allow_signup: "true",
  })
})

test("connecting: trades the code for a token, reads who it is, then deletes the authorization", async (t) => {
  answer({
    "POST /login/oauth/access_token": { body: { access_token: "gho_token", token_type: "bearer", scope: "" } },
    "GET /user": { body: { id: 42, login: "octo" } },
    "DELETE /applications/test-client/grant": { status: 204 },
  })
  assert.equal(await github.exchangeCode({ code: "the-code", verifier: "the-verifier", redirectUri: "http://x/cb" }), "gho_token")
  assert.deepEqual(JSON.parse(seen[0].body), {
    client_id: "test-client", client_secret: "test-secret", code: "the-code", redirect_uri: "http://x/cb", code_verifier: "the-verifier",
  })
  assert.equal(seen[0].headers.accept, "application/json")
  assert.deepEqual(await github.readGitHubUser("gho_token"), { id: 42, login: "octo" })
  assert.equal(seen[1].headers.authorization, "Bearer gho_token")
  await github.deleteGrant("gho_token")
  assert.equal(seen[2].headers.authorization, BASIC)
  assert.deepEqual(JSON.parse(seen[2].body), { access_token: "gho_token" })

  answer({ "POST /login/oauth/access_token": { body: { error: "bad_verification_code" } } })
  await fails(github.exchangeCode({ code: "old", verifier: "v", redirectUri: "http://x/cb" }), messages.CONNECT_FAILED, 400)
  answer({ "GET /user": { status: 401, body: { message: "Bad credentials" } } })
  await fails(github.readGitHubUser("revoked"), messages.CONNECT_FAILED, 400)

  // Deleting the authorization never throws: the token isn't kept either way.
  const logged = t.mock.method(console, "error", () => {})
  answer({ "DELETE /applications/test-client/grant": { status: 500, body: "boom" } })
  await github.deleteGrant("gho_token")
  assert.equal(logged.mock.calls[0]?.arguments[0], "Could not delete the GitHub authorization:")
})
