import { test } from "node:test"
import assert from "node:assert/strict"
import "./app-alias.mjs"

const {
  CONNECT_FAILED,
  NOT_SET_UP,
  TAKEN,
  connectHref,
  entriesInFolder,
  githubFileName,
  githubFileUrl,
  githubReturnMessage,
  matchFiles,
  parentFolder,
  parseGitHubLink,
  refCandidates,
  safeReturnPath,
} = await import("../../lib/github-links.ts")

const COMMIT = "0123456789abcdef0123456789abcdef01234567"

test("reads repository, folder and file links", () => {
  assert.deepEqual(parseGitHubLink("https://github.com/tmonga2208/devgram"), { owner: "tmonga2208", repo: "devgram", kind: "repo", rest: "", marked: null })
  assert.deepEqual(parseGitHubLink("https://github.com/facebook/react/tree/main/packages/react"), {
    owner: "facebook", repo: "react", kind: "tree", rest: "main/packages/react", marked: null,
  })
  assert.deepEqual(parseGitHubLink("https://github.com/o/r/blob/main/src/app.ts#L83-L85"), {
    owner: "o", repo: "r", kind: "blob", rest: "main/src/app.ts", marked: { from: 83, to: 85 },
  })
})

test("forgives the ways people copy links", () => {
  const repo = { owner: "o", repo: "r", kind: "repo", rest: "", marked: null }
  for (const text of [
    "github.com/o/r", "http://github.com/o/r", "https://www.github.com/o/r/", "  https://github.com/o/r.git  ",
    "https://github.com/o/r?tab=readme", "https://GitHub.com/o/r", "https://github.com/o/r/issues/12", "https://github.com/o/r/tree",
  ]) {
    assert.deepEqual(parseGitHubLink(text), repo, text)
  }
  assert.deepEqual(parseGitHubLink("https://github.com/o/r/blob/main/README.md?plain=1#L5").marked, { from: 5, to: 5 })
  assert.deepEqual(parseGitHubLink("https://github.com/o/r/blob/main/a.ts#L10C5-L12C20").marked, { from: 10, to: 12 })
  assert.deepEqual(parseGitHubLink("https://github.com/o/r/blob/main/a.ts#L12-L10").marked, { from: 10, to: 12 })
  assert.equal(parseGitHubLink("https://github.com/o/r/blob/main/a.ts#readme").marked, null)
  assert.equal(parseGitHubLink("https://github.com/o/r/blob/main/a.ts#L0").marked, null)
  assert.equal(parseGitHubLink("https://github.com/o/r/tree/main/src#L5").marked, null)
  assert.equal(parseGitHubLink("https://github.com/o/r/blob/main/docs/Getting%20Started.md").rest, "main/docs/Getting Started.md")
})

test("refuses what isn't a link to a GitHub repository", () => {
  for (const text of [
    "", "hello", "https://gitlab.com/o/r", "https://github.com/o", "https://github.com", "ftp://github.com/o/r",
    "https://github.com.evil.com/o/r", "https://github.com/-o/r", "https://github.com/o/..",
    "https://github.com/o/r/blob/main/%E0%A4%A", "javascript:alert(1)", `https://github.com/o/${"r".repeat(2100)}`,
  ]) {
    assert.equal(parseGitHubLink(text), null, text)
  }
})

test("splits a link's rest into a branch and a path, shortest branch first", () => {
  assert.deepEqual(refCandidates("main/src/app.ts", true), [{ ref: "main", path: "src/app.ts" }, { ref: "main/src", path: "app.ts" }])
  assert.deepEqual(refCandidates("feature/login", false), [{ ref: "feature", path: "login" }, { ref: "feature/login", path: "" }])
  assert.deepEqual(refCandidates("main", true), [])
  assert.deepEqual(refCandidates("main", false), [{ ref: "main", path: "" }])
  assert.equal(refCandidates("a/b/c/d/e/f/g/h.ts", true).length, 5)
  assert.deepEqual(refCandidates(`${COMMIT}/lib/a.ts`, true), [{ ref: COMMIT, path: "lib/a.ts" }])
  assert.deepEqual(refCandidates(COMMIT, true), [])
})

test("links to a file at its commit, at its marked lines", () => {
  const source = { owner: "o", repo: "r", commit: COMMIT, path: "lib/code-files.ts" }
  assert.equal(githubFileUrl(source), `https://github.com/o/r/blob/${COMMIT}/lib/code-files.ts`)
  assert.equal(githubFileUrl(source, { from: 80, to: 85 }), `https://github.com/o/r/blob/${COMMIT}/lib/code-files.ts#L80-L85`)
  assert.equal(githubFileUrl(source, { from: 9, to: 9 }), `https://github.com/o/r/blob/${COMMIT}/lib/code-files.ts#L9`)
  assert.equal(githubFileUrl({ ...source, path: "README.md" }, { from: 1, to: 2 }), `https://github.com/o/r/blob/${COMMIT}/README.md?plain=1#L1-L2`)
  assert.equal(
    githubFileUrl({ ...source, path: "docs/Getting Started/日本.md" }),
    `https://github.com/o/r/blob/${COMMIT}/docs/Getting%20Started/%E6%97%A5%E6%9C%AC.md?plain=1`,
  )
})

test("names a GitHub file after the last part of its path", () => {
  assert.equal(githubFileName("lib/code-files.ts"), "code-files.ts")
  assert.equal(githubFileName("Dockerfile"), "Dockerfile")
  assert.equal(githubFileName(`deep/${"n".repeat(120)}.ts`).length, 100)
  assert.equal(githubFileName("odd/back\\slash.ts"), "back_slash.ts")
})

test("lists what a folder holds, folders first, and finds files anywhere", () => {
  const entries = [
    { path: "README.md", type: "file", size: 1 },
    { path: "lib", type: "folder" },
    { path: "lib/b.ts", type: "file", size: 1 },
    { path: "lib/a.ts", type: "file", size: 1 },
    { path: "lib/deep", type: "folder" },
    { path: "lib/deep/c.ts", type: "file", size: 1 },
    { path: "app", type: "folder" },
  ]
  assert.deepEqual(entriesInFolder(entries, "").map((entry) => entry.path), ["app", "lib", "README.md"])
  assert.deepEqual(entriesInFolder(entries, "lib").map((entry) => entry.path), ["lib/deep", "lib/a.ts", "lib/b.ts"])
  assert.deepEqual(matchFiles(entries, " C.TS ").map((entry) => entry.path), ["lib/deep/c.ts"])
  assert.deepEqual(matchFiles(entries, "lib").map((entry) => entry.path), ["lib/b.ts", "lib/a.ts", "lib/deep/c.ts"])
  assert.deepEqual(matchFiles(entries, "  "), [])
  const many = Array.from({ length: 80 }, (_, i) => ({ path: `f${i}.ts`, type: "file", size: 1 }))
  assert.equal(matchFiles(many, ".ts").length, 50)
  assert.equal(parentFolder("lib/deep"), "lib")
  assert.equal(parentFolder("lib"), "")
})

test("only ever sends people back to a page on this site", () => {
  assert.equal(safeReturnPath("/create?tab=code"), "/create?tab=code")
  assert.equal(safeReturnPath("/settings?tab=account"), "/settings?tab=account")
  for (const value of [null, undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "/\t/evil.com", "\\\\evil.com", "/x".repeat(150), "javascript:alert(1)"]) {
    assert.equal(safeReturnPath(value), "/settings?tab=account", String(value))
  }
  assert.equal(connectHref("/create?tab=code"), "/api/github/connect?return=%2Fcreate%3Ftab%3Dcode")
})

test("says how connecting went", () => {
  assert.deepEqual(githubReturnMessage("connected", "octo"), { kind: "success", text: "Connected GitHub as @octo" })
  assert.deepEqual(githubReturnMessage("connected", null), { kind: "success", text: "Connected GitHub" })
  assert.deepEqual(githubReturnMessage("taken", null), { kind: "error", text: TAKEN })
  assert.deepEqual(githubReturnMessage("error", null), { kind: "error", text: CONNECT_FAILED })
  assert.deepEqual(githubReturnMessage("unavailable", null), { kind: "error", text: NOT_SET_UP })
  assert.equal(githubReturnMessage("cancelled", null), null)
  assert.equal(githubReturnMessage(null, null), null)
})
