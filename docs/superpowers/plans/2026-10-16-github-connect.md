# GitHub Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put files from GitHub into code posts. People connect a GitHub account (it then shows on their profile) or paste a link to any public file, mark a range of lines, and post. The feed opens the file on the marked lines, with the code around them and a link to the exact commit.

**Architecture:**

- `lib/code-files.ts` (the file rules; imports nothing) learns two optional fields on a file: `github: { owner, repo, commit, path }` and `marked: { from, to }`. It also gets their limits and a 27th language, Plain text.
- `lib/github-links.ts` (pure) reads and builds GitHub links. It holds the messages and response types the browser and the server share.
- `lib/github.ts` (server only) makes every call to GitHub. Public data is read with the OAuth app's client ID and secret. A person's token is used only while connecting, to learn who they are, and Devgram then deletes its authorization on GitHub. No token is stored anywhere.
- `lib/github-connect.ts` signs the 10-minute cookie that carries a connect attempt: the state, the PKCE verifier, who started it and where to return. The JWT helpers move from `lib/auth.ts` to `lib/tokens.ts`, which has no Next.js imports, so the unit tests can load them.
- Routes under `app/api/github/` connect, call back, disconnect, list your repositories, resolve a pasted link, list a repository's files and fetch one file. `POST /api/posts` fetches each GitHub file's code from GitHub at its commit and ignores any code sent with it.
- The code view gets a GitHub line ("owner/repo · path", View on GitHub) and opens marked files on their lines. Create's Code tab gets a From GitHub picker and a read-only GitHub file panel where lines are marked. Settings and profiles show the connection.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), Mongoose 8, `jose` (already installed), Prism 1.30, and GitHub's REST API (version `2022-11-28`) with its OAuth web flow and PKCE. Tests: `node:test` (`npm run test:unit`), `scripts/smoke.mjs` (API), `scripts/mobile-check.mjs` (headless Chrome over CDP).

**Spec:** `docs/superpowers/specs/2026-10-16-github-connect-design.md`

## Global Constraints

- **Limits** (spec, Rules):
  - A GitHub file's code: up to 100,000 characters (`MAX_GITHUB_FILE_CHARS = 100000`). Written files stay at 20,000 (`MAX_FILE_CHARS`).
  - All of a post's files together: up to 100,000 characters (`MAX_POST_CHARS = 100000`).
  - Marks: whole numbers, 1 ≤ `from` ≤ `to` ≤ the file's line count (as `displayLines` counts), and only on GitHub files. One range per file.
  - A marked file opens on lines `from − 3` to `to + 3`, kept inside the file (`CONTEXT_LINES = 3`). The feed still folds what's shown at 20 lines (`FEED_LINES`).
- **Plain text:** id `text`, label "Plain text", Prism `plain`, Monaco `plaintext`, extension `.txt`, last in `LANGUAGES`, which makes 27. A GitHub file whose name no language claims starts as Plain text.
- **Storage:**
  - Users get optional `github: { id: Number, login: String }` with a unique, sparse index on `github.id`.
  - Post files get optional `github: { owner, repo, commit, path }` and `marked: { from, to }` (subdocuments without `_id`).
  - Nothing else changes, and no GitHub token is ever stored.
- **Talking to GitHub:**
  - Only `lib/github.ts` calls GitHub, and only from the server.
  - Every API call goes to `api.github.com` with HTTP Basic (`GITHUB_CLIENT_ID:GITHUB_CLIENT_SECRET`), `Accept: application/vnd.github+json` (or `application/vnd.github.sha`), `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: devgram`, and a 10-second timeout. Exceptions: `GET /user`, which uses the person's token, and the token exchange at `github.com`.
  - Pasted links are parsed, never fetched.
  - `GITHUB_API_URL` and `GITHUB_WEB_URL` override the two hosts for the unit tests only.
- **Connecting:**
  - The cookie is `github_connect`: `Path=/api/github`, HttpOnly, SameSite=Lax, Secure on https, `Max-Age=600`, signed. It holds `state`, the PKCE verifier, the user id and the return page.
  - The authorize URL has `client_id`, `redirect_uri` (`<origin>/api/github/callback`), `state`, `code_challenge` (S256), `allow_signup=true` and no `scope`.
  - After reading `GET /user`, the callback deletes the grant (`DELETE /applications/<client id>/grant`).
  - Return pages must be paths on this site; anything else becomes `/settings?tab=account`.
  - The callback reports `?github=connected` (with `&github_login=<login>`), `taken`, `cancelled`, `error` or `unavailable`.
- **Spec copy, verbatim:**
  - "That isn't a GitHub link"
  - "That repository doesn't exist or is private"
  - "That file isn't in this repository"
  - "This repository is too big to browse here — paste a link to the file instead"
  - "This file is over 100,000 characters"
  - "This file isn't text, so it can't be shared"
  - "A post's files can add up to 100,000 characters"
  - "Marked lines must be inside the file"
  - "GitHub is busy — try again in a few minutes"
  - "Couldn't reach GitHub — try again"
  - "Connect GitHub first"
  - "This GitHub account is connected to another Devgram account"
  - "Couldn't connect GitHub — try again"
  - "GitHub isn't set up on this server"
  - "Connected GitHub as @<login>"
  - "Code from GitHub can't be edited."
  - "Show your GitHub on your profile and pick files from your repositories."
  - "Connected as @<login>"
  - "Show whole file (<N> lines)"
  - "Marked lines <from> to <to>"
- **Copy this plan adds** (the spec has no wording for these cases):
  - "That folder isn't in this repository"
  - "Couldn't find your GitHub account — connect GitHub again"
  - API only: "Only files from GitHub can have marked lines" and "Files from GitHub need an owner, a repository, a full commit and a path"
  - "Marked line <n>" (one line), "Connected GitHub" (no username), "Disconnected GitHub", "Failed to disconnect GitHub"
  - Labels:
    - Picker and code view: "From GitHub", "Connect GitHub", "Disconnect", "View on GitHub", "Paste a GitHub link", "Open", "Your repositories", "Filter your repositories", "No repositories", "Find a file", "No matching files", "This folder is empty", "Back", "Loading…"
    - Code tab: "Lines", "to", "Last line", "Clear", "Remove <name>"
    - Picker description: "Public repositories only. A file is shared as it is at its commit."
- **Tap targets:** on phones, every new button, link-button, row and input is at least 44px tall (`min-h-11 md:min-h-9`).
- **Modules the unit tests load:**
  - `lib/code-files.ts`, `lib/github-links.ts`, `lib/github.ts`, `lib/github-connect.ts`, `lib/tokens.ts`, `lib/http-error.ts` and `lib/code-draft.ts` must not import `next/server` or anything that does. Node can't resolve `next/server` without `.js`.
  - Node strips their types without transforming code, so write no parameter properties (`constructor(readonly x)`), enums or namespaces in them.
- **The GitHub fixture:** tests read `tmonga2208/devgram` (public) at commit `ecfbc5c00e21e249fe201ddb81698fc80e5c79dc`, which is on `origin/master`. At that commit:
  - `lib/code-files.ts` is 6,768 bytes and 126 lines and starts with `// Rules for the files in a code post`.
  - `lib/regex.ts` is 3 lines.
  - `scripts/mobile-check.mjs` is 77,846 bytes.
  - `package-lock.json` is 280,043 bytes, which is over 100,000 characters.
  - `public/icons/icon-192.png` is a PNG.
- **Safety:**
  - Never print `.env.local` or any secret. `GITHUB_CLIENT_SECRET` never goes into chat or onto a command line.
  - Run nothing against production.
  - The dev server runs on port 3210. Port 3000 belongs to another project and must never be stopped.
- **Dev server restarts:** Mongoose caches schemas, so restart the dev server after any change under `models/`, and after `.env.local` changes.
- **Phone checks:** tasks run the phone check with `MUX_TOKEN_ID=` and `BLOB_READ_WRITE_TOKEN=` set empty, so it skips uploads. The full run with uploads happens once, in Task 10. The GitHub parts of the smoke test and the phone check skip themselves when `GITHUB_CLIENT_ID` or `GITHUB_CLIENT_SECRET` is missing.
- **Branch:** work on a branch named `github-connect` made from `master`. Merging or pushing to `master` deploys production, so ask the user first (Task 10).
- **Commits:** every commit message ends with these two lines:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
  ```

**Dev server commands** (port 3000 belongs to another project; never stop it):

```bash
# start (in the background) and wait until it answers
npx next dev --turbopack -p 3210 > "${TMPDIR:-/tmp}/devgram-dev.log" 2>&1 &
curl -s -o /dev/null --retry 90 --retry-connrefused --retry-delay 1 -m 60 http://localhost:3210/api/health
# stop
lsof -ti tcp:3210 -sTCP:LISTEN | xargs kill
```

**Test commands used below** (set `TMPDIR` to a writable scratch folder if `/tmp` is not writable):

- `npm run test:unit`. One file: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/unit/<file>.test.mjs`
- `npm run typecheck` and `npm run lint`
- `env SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- <sections>`
- `PHONE_CHECK`, the phone check without uploads: `env SMOKE_BASE_URL=http://localhost:3210 MUX_TOKEN_ID= BLOB_READ_WRITE_TOKEN= npm run mobile-check`
- The full phone check, in Task 10: `env SMOKE_BASE_URL=http://localhost:3210 npm run mobile-check`

## Review Focus

1. **Paths with spaces or non-ASCII characters** (`docs/Getting Started.md`, `src/日本.ts`) are common in real repositories. Devgram must encode each path segment when it calls GitHub and when it builds View on GitHub links, and decode them when it reads a pasted link.
   Pinned in Task 2 (links built and read) and Task 3 (the stand-in GitHub receives `/contents/docs/Getting%20Started/%E6%97%A5%E6%9C%AC.md`).
2. **Windows line endings** (CRLF) in a GitHub file. Line counts, marks, the window and the line numbers must all agree, or the wrong lines get marked.
   Pinned in Task 1 (a mark on the last line of a CRLF file is accepted, one past it refused) and Task 7 (`highlightLines` on CRLF code).
3. **Two GitHub files with the same file name** (two `index.ts` from different folders) when picking several. Posting must say "Two files can't have the same name", and renaming a tab fixes it.
   Pinned in Task 1 (unit) and Task 5 (smoke: refused, then accepted renamed).
4. **Coming back from GitHub.** The caption and files must be back in the Code tab. When storage is blocked or holds something odd, the page must still load with an empty post instead of breaking.
   Pinned in Task 9: `readDraft` unit tests, and a phone check that restores a stored draft on `/create?tab=code&github=connected`.
5. **Typing a range backwards or only one number** ("85" to "83", or just "83"). The mark must come out as 83–85 or line 83, and the boxes must show what's marked.
   Pinned in Task 1 (`parseMarkInput` unit tests) and Task 9 (the phone check types "3" then "1" and gets lines 1–3).

## File Structure

Create:

| File | Responsibility |
| --- | --- |
| `lib/github-links.ts` | Reading GitHub links (`#L` anchors included), splitting a link's branch from its path, View on GitHub links, file names, folder listing and file search over a tree, safe return pages, the GitHub messages and the response types the browser and server share. |
| `lib/http-error.ts` | `HttpError`: an error a route answers with its own message and status. |
| `lib/github.ts` | Every call to GitHub: listing repositories, resolving links, trees, files, filling a post's GitHub files, and the OAuth calls. Server only. |
| `lib/tokens.ts` | Signing and reading login tokens and small signed records; reading a cookie from a request. No Next.js imports. |
| `lib/github-connect.ts` | The connect cookie: state, PKCE verifier and challenge, user, return page; the return URL. |
| `lib/code-draft.ts` | Keeping the Code tab's post in sessionStorage across the trip to GitHub. |
| `app/api/github/connect/route.ts` | `GET` starts connecting; `DELETE` disconnects. |
| `app/api/github/callback/route.ts` | Where GitHub sends people back. |
| `app/api/github/repos/route.ts` | Your public repositories. |
| `app/api/github/resolve/route.ts` | A pasted link → owner, repository, commit, path, kind, marks. |
| `app/api/github/tree/route.ts` | Every folder and file at a commit. |
| `app/api/github/file/route.ts` | One file's text, name, language and line count. |
| `components/github-mark.tsx` | GitHub's mark as an inline SVG (lucide's brand icons are deprecated). |
| `components/github-picker.tsx` | The From GitHub picker: a pasted link, your repositories, folders, Find a file. |
| `components/github-file-panel.tsx` | A GitHub file in the Code tab: source, read-only code, marking lines. |
| `components/github-settings.tsx` | Settings → Account: Connect GitHub / Connected as @login · Disconnect. |
| `hooks/use-github-return.ts` | Says how connecting went (`?github=…`) once, then cleans the address. |
| `scripts/unit/github-links.test.mjs`, `scripts/unit/github.test.mjs`, `scripts/unit/github-connect.test.mjs`, `scripts/unit/code-draft.test.mjs` | Unit tests. |

Modify:

- **Rules:** `lib/code-files.ts`, `lib/code-highlight.ts`
- **Server code:** `lib/auth.ts`, `lib/http.ts`, `lib/user-response.ts`, `models/User.ts`, `models/Post.ts`, `app/api/posts/route.ts`, `app/api/users/[username]/route.ts`
- **Browser code:** `lib/types.ts`, `contexts/auth-context.tsx`, `contexts/posts-context.tsx`, `components/highlighted-code.tsx`, `components/code-view.tsx`, `components/code-files-editor.tsx`, `components/create-post-form.tsx`, `components/profile.tsx`, `app/settings/page.tsx`
- **Tests:** `scripts/unit/code-files.test.mjs`, `scripts/unit/code-highlight.test.mjs`, `scripts/lib/test-users.mjs`, `scripts/smoke.mjs`, `scripts/mobile-check.mjs`
- **Docs:** `README.md`

## Before Task 4: the GitHub OAuth app (the user does this)

Tasks 1–3 need nothing from GitHub. From Task 4 on, the smoke test and the phone check call GitHub with the app's ID and secret. So after Task 3, stop and ask the user to do the following:

1. **Register the app.** Open https://github.com/settings/applications/new (Settings → Developer settings → OAuth apps → New OAuth App):
   - Application name: `Devgram`
   - Homepage URL: `https://devgram-nine.vercel.app`
   - Authorization callback URL: `https://devgram-nine.vercel.app/api/github/callback`. Then click **Add callback URL** and add `http://localhost:3000/api/github/callback` and `http://localhost:3210/api/github/callback` (3210 is the port these tasks use).
   - Leave "Expire user access tokens" on and "Enable Device Flow" off. Click **Register application**.
2. **Create a secret.** On the app's page, click **Generate a new client secret**.
3. **Store the keys on Vercel.** In the Vercel dashboard (project `devgram` → Settings → Environment Variables), add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` for Production, Preview and Development. Mark the secret Sensitive.
4. **Store the keys locally.** Add the same two lines to `.env.local` by hand: `GITHUB_CLIENT_ID=…` and `GITHUB_CLIENT_SECRET=…`.

The secret never passes through the chat or a command line. Check that both lines are there without printing them, then restart the dev server:

```bash
grep -cE '^GITHUB_CLIENT_(ID|SECRET)=.+' .env.local   # prints 2
```

---
### Task 1: Rules for GitHub files, marked lines and Plain text

**Files:**
- Modify: `lib/code-files.ts` (whole file below), `scripts/unit/code-files.test.mjs`, `scripts/unit/code-highlight.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces (`lib/code-files.ts`):
  - **Types:**
    - `interface GitHubSource { owner: string; repo: string; commit: string; path: string }`
    - `interface MarkedLines { from: number; to: number }`
    - `CodeFile` gains optional `github?: GitHubSource` and `marked?: MarkedLines`
    - `type FileRequest = Omit<CodeFile, "code"> & { code?: string }`
  - **Limits:** `MAX_GITHUB_FILE_CHARS = 100000`, `MAX_POST_CHARS = 100000`, `CONTEXT_LINES = 3`.
  - **Messages:** `GITHUB_FILE_TOO_LONG`, `POST_TOO_LONG`, `BAD_MARKS`, `MARKS_GITHUB_ONLY`, `BAD_SOURCE`.
  - **GitHub naming:** `OWNER_PATTERN: RegExp`, `COMMIT_PATTERN: RegExp`, `isRepoName(name: string): boolean`, `isRepoPath(path: string): boolean`, `parseGitHubSource(value: unknown): GitHubSource | null`.
  - **Marks:**
    - `markedWindow(lineCount: number, marked: MarkedLines): { first: number; last: number }`
    - `markFromClick(current: MarkedLines | null, line: number, shift: boolean): MarkedLines | null`
    - `parseMarkInput(fromText: string, toText: string): MarkedLines | null | undefined` (undefined means "can't read")
    - `markedLabel(marked: MarkedLines): string`
  - **Changed:** `LANGUAGES` gains Plain text as the 27th entry, and `parseFiles` accepts GitHub files and marks.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b github-connect master
```

- [ ] **Step 2: Write the failing tests**

In `scripts/unit/code-files.test.mjs`, replace the import block at the top with:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  BAD_FILES,
  BAD_MARKS,
  BAD_NAME,
  BAD_SOURCE,
  EMPTY_FILE,
  FILE_TOO_LONG,
  GITHUB_FILE_TOO_LONG,
  LANGUAGES,
  MARKS_GITHUB_ONLY,
  NAME_NEEDED,
  POST_TOO_LONG,
  SAME_NAME,
  TOO_MANY_FILES,
  UNKNOWN_LANGUAGE,
  displayLines,
  guessLanguage,
  languageLabel,
  markFromClick,
  markedLabel,
  markedWindow,
  parseFiles,
  parseGitHubSource,
  parseMarkInput,
  postFiles,
} from "../../lib/code-files.ts"
```

Replace the test `"has the 26 languages, each with a Prism and a Monaco name"` with:

```js
test("has the 27 languages, each with a Prism and a Monaco name", () => {
  assert.deepEqual(
    LANGUAGES.map((language) => language.label),
    ["JavaScript", "TypeScript", "JSX", "TSX", "HTML", "CSS", "SCSS", "JSON", "Python", "Java", "C#", "C", "C++", "Go",
      "Rust", "PHP", "Ruby", "Kotlin", "Swift", "Dart", "SQL", "Bash", "YAML", "Markdown", "Dockerfile", "GraphQL", "Plain text"],
  )
  for (const language of LANGUAGES) assert.ok(language.prism && language.monaco, language.id)
  assert.equal(new Set(LANGUAGES.map((language) => language.id)).size, 27)
  assert.deepEqual(LANGUAGES.at(-1), { id: "text", label: "Plain text", prism: "plain", monaco: "plaintext", extensions: [".txt"] })
})
```

In the test `"guesses the language from the file name"`, add `"notes.txt": "text",` to `cases`, and change the list of names that guess nothing to `["", "notes", "archive.", "Makefile"]`.

Append these tests at the end of the file:

```js
const COMMIT = "0123456789abcdef0123456789abcdef01234567"
const source = (path = "src/app.ts") => ({ owner: "octo-cat", repo: "hello.world", commit: COMMIT, path })
const fromGitHub = (name, code, extra = {}) => ({ name, language: "typescript", code, github: source(`src/${name}`), ...extra })

test("accepts a file from GitHub with its source and marked lines", () => {
  const code = "a\nb\nc\nd\n"
  assert.deepEqual(parseFiles([fromGitHub("app.ts", code, { marked: { from: 2, to: 4 } })]), {
    files: [{ name: "app.ts", language: "typescript", code, github: source("src/app.ts"), marked: { from: 2, to: 4 } }],
  })
  // Files from GitHub and files written here mix; written files come back without the GitHub fields.
  const mixed = parseFiles([fromGitHub("app.ts", "x"), file("notes.txt", "text", "plain words")])
  assert.deepEqual(mixed.files[1], file("notes.txt", "text", "plain words"))
  // A mark sent as null is no mark.
  assert.equal("marked" in parseFiles([fromGitHub("app.ts", "x", { marked: null })]).files[0], false)
})

test("lets a GitHub file have up to 100,000 characters, and a post's files 100,000 together", () => {
  assert.ok("files" in parseFiles([fromGitHub("big.ts", "x".repeat(100000))]))
  assert.deepEqual(parseFiles([fromGitHub("big.ts", "x".repeat(100001))]), { error: GITHUB_FILE_TOO_LONG })
  assert.deepEqual(parseFiles([file("a.js", "javascript", "x".repeat(20001))]), { error: FILE_TOO_LONG })
  const nearly = [fromGitHub("big.ts", "x".repeat(60000)), file("a.js", "javascript", "x".repeat(20000)), file("b.js", "javascript", "x".repeat(20000))]
  assert.ok("files" in parseFiles(nearly))
  assert.deepEqual(parseFiles([...nearly, file("c.js", "javascript", "x")]), { error: POST_TOO_LONG })
})

test("refuses marks outside the file, backwards marks and marks on written files", () => {
  const code = "one\ntwo\nthree"
  for (const marked of [{ from: 0, to: 1 }, { from: 2, to: 4 }, { from: 3, to: 2 }, { from: 1.5, to: 2 }, { from: "1", to: 2 }, { from: 1 }, "1-2"]) {
    assert.deepEqual(parseFiles([fromGitHub("a.ts", code, { marked })]), { error: BAD_MARKS }, JSON.stringify(marked))
  }
  assert.deepEqual(parseFiles([{ ...file("a.js", "javascript", code), marked: { from: 1, to: 1 } }]), { error: MARKS_GITHUB_ONLY })
})

test("counts a GitHub file's lines the way the code view does: Windows line endings, a final line break", () => {
  const crlf = "one\r\ntwo\r\nthree\r\n"
  assert.ok("files" in parseFiles([fromGitHub("a.ts", crlf, { marked: { from: 3, to: 3 } })]))
  assert.deepEqual(parseFiles([fromGitHub("a.ts", crlf, { marked: { from: 4, to: 4 } })]), { error: BAD_MARKS })
})

test("refuses a GitHub source that isn't a whole one", () => {
  const broken = [
    { ...source(), commit: "main" },
    { ...source(), commit: COMMIT.toUpperCase() },
    { ...source(), commit: COMMIT.slice(0, 7) },
    { ...source(), owner: "-octo" },
    { ...source(), owner: "o".repeat(40) },
    { ...source(), repo: ".." },
    { ...source(), repo: "has space" },
    { ...source(), path: "" },
    { ...source(), path: "../secrets.txt" },
    { ...source(), path: "lib//app.ts" },
    { ...source(), path: "/lib/app.ts" },
    { ...source(), path: "lib/\u0000.ts" },
    { ...source(), path: "x".repeat(1001) },
    { owner: "octo", repo: "r", commit: COMMIT },
    "octo/r",
  ]
  for (const github of broken) {
    assert.deepEqual(parseFiles([{ name: "a.ts", language: "typescript", code: "x", github }]), { error: BAD_SOURCE }, JSON.stringify(github))
  }
  assert.deepEqual(parseGitHubSource(source("docs/Getting Started/日本.md")), source("docs/Getting Started/日本.md"))
})

test("two GitHub files with one name need one renamed", () => {
  const two = [fromGitHub("index.ts", "a"), { ...fromGitHub("index.ts", "b"), github: source("other/index.ts") }]
  assert.deepEqual(parseFiles(two), { error: SAME_NAME })
  assert.ok("files" in parseFiles([two[0], { ...two[1], name: "other-index.ts" }]))
})

test("opens a marked file on its mark with 3 lines either side, inside the file", () => {
  assert.deepEqual(markedWindow(126, { from: 80, to: 85 }), { first: 77, last: 88 })
  assert.deepEqual(markedWindow(126, { from: 1, to: 2 }), { first: 1, last: 5 })
  assert.deepEqual(markedWindow(126, { from: 125, to: 126 }), { first: 122, last: 126 })
  assert.deepEqual(markedWindow(1, { from: 1, to: 1 }), { first: 1, last: 1 })
  assert.deepEqual(markedWindow(10, { from: 1, to: 10 }), { first: 1, last: 10 })
})

test("marks lines by clicking their numbers", () => {
  assert.deepEqual(markFromClick(null, 5, false), { from: 5, to: 5 })
  assert.equal(markFromClick({ from: 5, to: 5 }, 5, false), null)
  assert.deepEqual(markFromClick({ from: 5, to: 9 }, 7, false), { from: 7, to: 7 })
  assert.deepEqual(markFromClick({ from: 5, to: 5 }, 9, true), { from: 5, to: 9 })
  assert.deepEqual(markFromClick({ from: 5, to: 9 }, 2, true), { from: 2, to: 5 })
  assert.deepEqual(markFromClick(null, 3, true), { from: 3, to: 3 })
})

test("reads the Lines boxes", () => {
  assert.deepEqual(parseMarkInput("83", "85"), { from: 83, to: 85 })
  assert.deepEqual(parseMarkInput("85", "83"), { from: 83, to: 85 })
  assert.deepEqual(parseMarkInput(" 83 ", ""), { from: 83, to: 83 })
  assert.deepEqual(parseMarkInput("", "7"), { from: 7, to: 7 })
  assert.equal(parseMarkInput("", " "), null)
  for (const [a, b] of [["x", "2"], ["0", "3"], ["1.5", "2"], ["-1", "2"], ["2", "e3"]]) {
    assert.equal(parseMarkInput(a, b), undefined, `${a} to ${b}`)
  }
})

test("says which lines are marked, for screen readers", () => {
  assert.equal(markedLabel({ from: 83, to: 85 }), "Marked lines 83 to 85")
  assert.equal(markedLabel({ from: 9, to: 9 }), "Marked line 9")
})
```

In `scripts/unit/code-highlight.test.mjs`, change the first assertion of `"every language is coloured by its own grammar"` so Plain text is left out:

```js
  assert.deepEqual(Object.keys(SAMPLES).sort(), LANGUAGES.map((language) => language.id).filter((id) => id !== "text").sort())
```

and append:

```js
test("leaves Plain text plain", () => {
  assert.deepEqual(highlight("const a = 1 // not code here", "text"), ["const a = 1 // not code here"])
})
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/unit/code-files.test.mjs scripts/unit/code-highlight.test.mjs`
Expected: FAIL. `code-files.test.mjs` stops with `SyntaxError: The requested module '../../lib/code-files.ts' does not provide an export named 'BAD_MARKS'`, and the Plain text highlight test fails.

- [ ] **Step 4: Write the rules**

Replace `lib/code-files.ts` with:

```ts
// Rules for the files in a code post, shared by the API and the browser. It
// imports nothing, so the unit tests load it in Node.

// Where a file taken from GitHub came from: the repository as GitHub spells
// it, a full commit, and the file's path there. Only the server sets it, from
// what GitHub sent (lib/github.ts).
export interface GitHubSource {
  owner: string
  repo: string
  commit: string
  path: string
}

// The lines a file points out, counted from 1, both included.
export interface MarkedLines {
  from: number
  to: number
}

export interface CodeFile {
  name: string
  language: string
  code: string
  // Files from GitHub only.
  github?: GitHubSource
  marked?: MarkedLines
}

// A file as the browser sends it: a GitHub file goes without its code, which
// the server fetches from GitHub.
export type FileRequest = Omit<CodeFile, "code"> & { code?: string }

export const MAX_FILES = 5
export const MAX_FILE_CHARS = 20000
// A file from GitHub can be bigger than one written here. All of a post's
// files together stay within what five written files can reach.
export const MAX_GITHUB_FILE_CHARS = 100000
export const MAX_POST_CHARS = 100000
export const MAX_FILE_NAME = 100
// The feed shows this many lines of a file, then "Show all".
export const FEED_LINES = 20
// A marked file opens on its marked lines with this many lines either side.
export const CONTEXT_LINES = 3

export const TOO_MANY_FILES = "A post can have up to 5 files"
export const NAME_NEEDED = "Give each file a name"
export const SAME_NAME = "Two files can't have the same name"
export const FILE_TOO_LONG = "Each file can be up to 20,000 characters"
export const EMPTY_FILE = "A file can't be empty"
export const BAD_NAME = "File names can be up to 100 characters, without / or \\"
export const UNKNOWN_LANGUAGE = "Choose a language from the list"
export const BAD_FILES = "Files must be a list of { name, language, code }"
export const GITHUB_FILE_TOO_LONG = "This file is over 100,000 characters"
export const POST_TOO_LONG = "A post's files can add up to 100,000 characters"
export const BAD_MARKS = "Marked lines must be inside the file"
export const MARKS_GITHUB_ONLY = "Only files from GitHub can have marked lines"
export const BAD_SOURCE = "Files from GitHub need an owner, a repository, a full commit and a path"

export interface Language {
  id: string
  label: string
  // Prism's name for its grammar, and Monaco's for its language.
  prism: string
  monaco: string
  // Lower-case, with the dot. A file named Dockerfile is matched by name.
  extensions: string[]
}

// The ids the old form stored (javascript, typescript, jsx, html, css,
// python, java, csharp) keep their meaning. Plain text comes last: files from
// GitHub that no other language claims start as Plain text.
export const LANGUAGES: Language[] = [
  { id: "javascript", label: "JavaScript", prism: "javascript", monaco: "javascript", extensions: [".js", ".mjs", ".cjs"] },
  { id: "typescript", label: "TypeScript", prism: "typescript", monaco: "typescript", extensions: [".ts", ".mts", ".cts"] },
  { id: "jsx", label: "JSX", prism: "jsx", monaco: "javascript", extensions: [".jsx"] },
  { id: "tsx", label: "TSX", prism: "tsx", monaco: "typescript", extensions: [".tsx"] },
  { id: "html", label: "HTML", prism: "markup", monaco: "html", extensions: [".html", ".htm"] },
  { id: "css", label: "CSS", prism: "css", monaco: "css", extensions: [".css"] },
  { id: "scss", label: "SCSS", prism: "scss", monaco: "scss", extensions: [".scss"] },
  { id: "json", label: "JSON", prism: "json", monaco: "json", extensions: [".json"] },
  { id: "python", label: "Python", prism: "python", monaco: "python", extensions: [".py"] },
  { id: "java", label: "Java", prism: "java", monaco: "java", extensions: [".java"] },
  { id: "csharp", label: "C#", prism: "csharp", monaco: "csharp", extensions: [".cs"] },
  { id: "c", label: "C", prism: "c", monaco: "c", extensions: [".c", ".h"] },
  { id: "cpp", label: "C++", prism: "cpp", monaco: "cpp", extensions: [".cpp", ".cc", ".cxx", ".hpp", ".hh"] },
  { id: "go", label: "Go", prism: "go", monaco: "go", extensions: [".go"] },
  { id: "rust", label: "Rust", prism: "rust", monaco: "rust", extensions: [".rs"] },
  { id: "php", label: "PHP", prism: "php", monaco: "php", extensions: [".php"] },
  { id: "ruby", label: "Ruby", prism: "ruby", monaco: "ruby", extensions: [".rb"] },
  { id: "kotlin", label: "Kotlin", prism: "kotlin", monaco: "kotlin", extensions: [".kt", ".kts"] },
  { id: "swift", label: "Swift", prism: "swift", monaco: "swift", extensions: [".swift"] },
  { id: "dart", label: "Dart", prism: "dart", monaco: "dart", extensions: [".dart"] },
  { id: "sql", label: "SQL", prism: "sql", monaco: "sql", extensions: [".sql"] },
  { id: "bash", label: "Bash", prism: "bash", monaco: "shell", extensions: [".sh", ".bash"] },
  { id: "yaml", label: "YAML", prism: "yaml", monaco: "yaml", extensions: [".yml", ".yaml"] },
  { id: "markdown", label: "Markdown", prism: "markdown", monaco: "markdown", extensions: [".md", ".markdown"] },
  { id: "dockerfile", label: "Dockerfile", prism: "docker", monaco: "dockerfile", extensions: [".dockerfile"] },
  { id: "graphql", label: "GraphQL", prism: "graphql", monaco: "graphql", extensions: [".graphql", ".gql"] },
  { id: "text", label: "Plain text", prism: "plain", monaco: "plaintext", extensions: [".txt"] },
]

export function languageById(id: string): Language | undefined {
  return LANGUAGES.find((language) => language.id === id)
}

// What to call a language. An old post may name one the list doesn't have;
// it is shown as it was stored.
export function languageLabel(id: string): string {
  return languageById(id)?.label ?? id
}

// The language a file name points to, or null when the name doesn't say.
export function guessLanguage(name: string): string | null {
  const lower = name.trim().toLowerCase()
  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) return "dockerfile"
  const dot = lower.lastIndexOf(".")
  if (dot === -1) return null
  const extension = lower.slice(dot)
  return LANGUAGES.find((language) => language.extensions.includes(extension))?.id ?? null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// GitHub's naming rules. Owners: letters, digits and hyphens, up to 39, not
// starting with a hyphen. Repositories: letters, digits, ".", "_" and "-".
// Commits: the full 40 characters GitHub returns.
export const OWNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/
export const COMMIT_PATTERN = /^[0-9a-f]{40}$/
const MAX_PATH = 1000

export function isRepoName(name: string): boolean {
  return REPO_PATTERN.test(name) && name !== "." && name !== ".."
}

// A path inside a repository: no empty, "." or ".." segments and no control
// characters, so it can only ever name something in that repository.
export function isRepoPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= MAX_PATH &&
    !/[\u0000-\u001f]/.test(path) &&
    path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  )
}

// A GitHub source as a request sent it, checked, or null.
export function parseGitHubSource(value: unknown): GitHubSource | null {
  if (!isRecord(value)) return null
  const { owner, repo, commit, path } = value
  if (typeof owner !== "string" || typeof repo !== "string" || typeof commit !== "string" || typeof path !== "string") return null
  if (!OWNER_PATTERN.test(owner) || !isRepoName(repo) || !COMMIT_PATTERN.test(commit) || !isRepoPath(path)) return null
  return { owner, repo, commit, path }
}

const isLine = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1

// Marked lines as a request sent them, checked against the file's lines, or null.
function parseMarks(value: unknown, lineCount: number): MarkedLines | null {
  if (!isRecord(value)) return null
  const { from, to } = value
  if (!isLine(from) || !isLine(to) || from > to || to > lineCount) return null
  return { from, to }
}

// Checks the files a code post was sent with: the files to store, or the
// first problem in words a person can act on. Names are trimmed (a missing
// one counts as empty); code is kept exactly as written. A file from GitHub
// arrives here with the code the server fetched for it (lib/github.ts).
export function parseFiles(value: unknown): { files: CodeFile[] } | { error: string } {
  if (!Array.isArray(value) || value.length === 0) return { error: BAD_FILES }
  if (value.length > MAX_FILES) return { error: TOO_MANY_FILES }
  const files: CodeFile[] = []
  for (const item of value) {
    if (!isRecord(item)) return { error: BAD_FILES }
    const { name = "", language, code } = item
    if (typeof name !== "string" || typeof language !== "string" || typeof code !== "string") return { error: BAD_FILES }
    const trimmed = name.trim()
    if (trimmed.length > MAX_FILE_NAME || /[/\\]/.test(trimmed)) return { error: BAD_NAME }
    if (!languageById(language)) return { error: UNKNOWN_LANGUAGE }
    let github: GitHubSource | null = null
    if (item.github != null) {
      github = parseGitHubSource(item.github)
      if (!github) return { error: BAD_SOURCE }
    }
    if (!code.trim()) return { error: EMPTY_FILE }
    if (code.length > (github ? MAX_GITHUB_FILE_CHARS : MAX_FILE_CHARS)) {
      return { error: github ? GITHUB_FILE_TOO_LONG : FILE_TOO_LONG }
    }
    const file: CodeFile = { name: trimmed, language, code }
    if (github) file.github = github
    if (item.marked != null) {
      if (!github) return { error: MARKS_GITHUB_ONLY }
      const marked = parseMarks(item.marked, displayLines(code).length)
      if (!marked) return { error: BAD_MARKS }
      file.marked = marked
    }
    files.push(file)
  }
  if (files.length > 1 && files.some((file) => !file.name)) return { error: NAME_NEEDED }
  if (new Set(files.map((file) => file.name)).size < files.length) return { error: SAME_NAME }
  if (files.reduce((total, file) => total + file.code.length, 0) > MAX_POST_CHARS) return { error: POST_TOO_LONG }
  return { files }
}

// A post's code as files. Posts from before files keep `code` and
// `language` and read as one file with no name (JavaScript when they never
// said which language).
export function postFiles(post: { files?: CodeFile[]; code?: string; language?: string }): CodeFile[] {
  if (post.files && post.files.length > 0) return post.files
  if (post.code) return [{ name: "", language: post.language || "javascript", code: post.code }]
  return []
}

// The lines a file shows. Windows line endings count as one break, and a
// final line break doesn't add an empty last line.
export function displayLines(code: string): string[] {
  const text = code.replace(/\r\n?/g, "\n")
  return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n")
}

// The lines a marked file opens on: the mark and CONTEXT_LINES either side,
// kept inside the file.
export function markedWindow(lineCount: number, marked: MarkedLines): { first: number; last: number } {
  return { first: Math.max(1, marked.from - CONTEXT_LINES), last: Math.min(lineCount, marked.to + CONTEXT_LINES) }
}

// What a click on a line number does to the mark: a click marks that line
// (or clears the mark when that line is all it holds); a shift-click
// stretches the mark from where it starts to that line.
export function markFromClick(current: MarkedLines | null, line: number, shift: boolean): MarkedLines | null {
  if (shift && current) return { from: Math.min(current.from, line), to: Math.max(current.from, line) }
  if (current && current.from === line && current.to === line) return null
  return { from: line, to: line }
}

// The Lines boxes: both empty clears the mark, one number marks that line,
// two mark the lines between them in either order. undefined when they can't
// be read, so the mark stays as it was.
export function parseMarkInput(fromText: string, toText: string): MarkedLines | null | undefined {
  const read = (text: string): number | null => {
    const trimmed = text.trim()
    if (!trimmed) return null
    return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN
  }
  const from = read(fromText)
  const to = read(toText)
  if (Number.isNaN(from) || Number.isNaN(to)) return undefined
  if (from === null && to === null) return null
  const a = from ?? (to as number)
  const b = to ?? (from as number)
  if (a < 1 || b < 1) return undefined
  return { from: Math.min(a, b), to: Math.max(a, b) }
}

// What a screen reader hears before a marked file's code.
export function markedLabel(marked: MarkedLines): string {
  return marked.from === marked.to ? `Marked line ${marked.from}` : `Marked lines ${marked.from} to ${marked.to}`
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/unit/code-files.test.mjs scripts/unit/code-highlight.test.mjs`
Expected: PASS, every test.

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all pass with no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/code-files.ts scripts/unit/code-files.test.mjs scripts/unit/code-highlight.test.mjs
git commit -q -F - <<'EOF'
Add the rules for GitHub files, marked lines and Plain text

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 2: Reading and building GitHub links

**Files:**
- Create: `lib/github-links.ts`, `scripts/unit/github-links.test.mjs`

**Interfaces:**
- Consumes (Task 1, `lib/code-files.ts`): `COMMIT_PATTERN`, `OWNER_PATTERN`, `MAX_FILE_NAME`, `isRepoName`, `GitHubSource`, `MarkedLines`.
- Produces (`lib/github-links.ts`):
  - **Messages:** `NOT_A_LINK`, `REPO_NOT_FOUND`, `FILE_NOT_FOUND`, `FOLDER_NOT_FOUND`, `TOO_BIG_TO_BROWSE`, `NOT_TEXT`, `BUSY`, `UNREACHABLE`, `CONNECT_FIRST`, `ACCOUNT_GONE`, `TAKEN`, `CONNECT_FAILED`, `NOT_SET_UP`.
  - **Answer types:**
    - `GitHubRepo { owner; name; description; language: string | null; defaultBranch }`
    - `ResolvedLink { owner; repo; commit; kind: "repo" | "folder" | "file"; path; marked: MarkedLines | null }`
    - `TreeEntry { path; type: "file" | "folder"; size?: number }`
    - `GitHubFileResponse { name; language; code; lineCount; github: GitHubSource }`
  - **`GitHubLink`:** `{ owner; repo; kind: "repo" | "tree" | "blob"; rest: string; marked: MarkedLines | null }`
  - **Functions:**
    - `parseGitHubLink(input: string): GitHubLink | null`
    - `refCandidates(rest: string, needPath: boolean, max = 5): { ref: string; path: string }[]`
    - `githubFileUrl(source: GitHubSource, marked?: MarkedLines | null): string`
    - `githubFileName(path: string): string`
    - `parentFolder(path: string): string`
    - `entriesInFolder(entries: TreeEntry[], folder: string): TreeEntry[]`
    - `matchFiles(entries: TreeEntry[], query: string, limit = 50): TreeEntry[]`
    - `safeReturnPath(value: string | null | undefined): string` (fallback `/settings?tab=account`)
    - `connectHref(returnTo: string): string`
    - `githubReturnMessage(result: string | null, login: string | null): { kind: "success" | "error"; text: string } | null`

- [ ] **Step 1: Write the failing test**

Create `scripts/unit/github-links.test.mjs`:

```js
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/unit/github-links.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/github-links.ts`.

- [ ] **Step 3: Write the module**

Create `lib/github-links.ts`:

```ts
// Reading GitHub links and building them, for the picker, the code view and
// the server, with the messages and answers they share. It imports only the
// file rules, so the unit tests load it directly.
import {
  COMMIT_PATTERN,
  MAX_FILE_NAME,
  OWNER_PATTERN,
  isRepoName,
  type GitHubSource,
  type MarkedLines,
} from "@/lib/code-files"

export const NOT_A_LINK = "That isn't a GitHub link"
export const REPO_NOT_FOUND = "That repository doesn't exist or is private"
export const FILE_NOT_FOUND = "That file isn't in this repository"
export const FOLDER_NOT_FOUND = "That folder isn't in this repository"
export const TOO_BIG_TO_BROWSE = "This repository is too big to browse here — paste a link to the file instead"
export const NOT_TEXT = "This file isn't text, so it can't be shared"
export const BUSY = "GitHub is busy — try again in a few minutes"
export const UNREACHABLE = "Couldn't reach GitHub — try again"
export const CONNECT_FIRST = "Connect GitHub first"
export const ACCOUNT_GONE = "Couldn't find your GitHub account — connect GitHub again"
export const TAKEN = "This GitHub account is connected to another Devgram account"
export const CONNECT_FAILED = "Couldn't connect GitHub — try again"
export const NOT_SET_UP = "GitHub isn't set up on this server"

// What the GitHub routes answer with (app/api/github).
export interface GitHubRepo {
  owner: string
  name: string
  description: string
  language: string | null
  defaultBranch: string
}

export interface ResolvedLink {
  owner: string
  repo: string
  commit: string
  kind: "repo" | "folder" | "file"
  // The folder or file; "" for the repository itself.
  path: string
  marked: MarkedLines | null
}

export interface TreeEntry {
  path: string
  type: "file" | "folder"
  // Files only: the size in bytes.
  size?: number
}

export interface GitHubFileResponse {
  name: string
  language: string
  code: string
  lineCount: number
  github: GitHubSource
}

// A pasted link, read without asking GitHub anything.
export interface GitHubLink {
  owner: string
  repo: string
  // The repository's front page, a folder (tree/) or a file (blob/).
  kind: "repo" | "tree" | "blob"
  // What follows tree/ or blob/: a branch, tag or commit, then the path. Only
  // GitHub can tell where a branch name ends, so the two stay together.
  rest: string
  marked: MarkedLines | null
}

const HOSTS = new Set(["github.com", "www.github.com"])
const MAX_LINK = 2048

// Lines from a link's anchor: #L5, #L5-L9, and the column form #L5C3-L9C10.
function readAnchor(hash: string): MarkedLines | null {
  const match = /^#L(\d+)(?:C\d+)?(?:-L(\d+)(?:C\d+)?)?$/.exec(hash)
  if (!match) return null
  const a = Number(match[1])
  const b = match[2] ? Number(match[2]) : a
  if (a < 1 || b < 1) return null
  return { from: Math.min(a, b), to: Math.max(a, b) }
}

// A link to a repository, a folder or a file on github.com, or null. Links to
// a repository's other pages (issues, pull requests…) count as the repository.
export function parseGitHubLink(input: string): GitHubLink | null {
  const text = input.trim()
  if (!text || text.length > MAX_LINK) return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || !HOSTS.has(url.hostname.toLowerCase())) return null
  let segments: string[]
  try {
    segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment))
  } catch {
    return null
  }
  if (segments.length < 2) return null
  const owner = segments[0]
  const repo = segments[1].replace(/\.git$/i, "")
  if (!OWNER_PATTERN.test(owner) || !isRepoName(repo)) return null
  const mode = segments[2]
  if ((mode === "tree" || mode === "blob") && segments.length > 3) {
    return { owner, repo, kind: mode, rest: segments.slice(3).join("/"), marked: mode === "blob" ? readAnchor(url.hash) : null }
  }
  return { owner, repo, kind: "repo", rest: "", marked: null }
}

// The ways to split a link's rest into a branch (or tag, or commit) and a
// path, shortest branch first, at most `max`. A file link needs a path; a
// folder link may name just a branch. A link that starts with a full commit
// has only one reading.
export function refCandidates(rest: string, needPath: boolean, max = 5): { ref: string; path: string }[] {
  const segments = rest.split("/").filter(Boolean)
  if (segments.length === 0) return []
  if (COMMIT_PATTERN.test(segments[0])) {
    const path = segments.slice(1).join("/")
    return needPath && !path ? [] : [{ ref: segments[0], path }]
  }
  const candidates: { ref: string; path: string }[] = []
  for (let cut = 1; cut <= segments.length && candidates.length < max; cut++) {
    const path = segments.slice(cut).join("/")
    if (needPath && !path) break
    candidates.push({ ref: segments.slice(0, cut).join("/"), path })
  }
  return candidates
}

const RENDERED = /\.(md|markdown|mdx)$/i

// The file on github.com at its commit, opened at the marked lines. Markdown
// gets ?plain=1, so GitHub shows lines instead of the rendered page.
export function githubFileUrl(source: GitHubSource, marked?: MarkedLines | null): string {
  const path = source.path.split("/").map(encodeURIComponent).join("/")
  const plain = RENDERED.test(source.path) ? "?plain=1" : ""
  const lines = marked ? (marked.from === marked.to ? `#L${marked.from}` : `#L${marked.from}-L${marked.to}`) : ""
  return `https://github.com/${source.owner}/${source.repo}/blob/${source.commit}/${path}${plain}${lines}`
}

// A GitHub file's tab name: the last part of its path, cut to the longest
// name a file may have, with any backslash (names can't hold one) made "_".
export function githubFileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\\/g, "_").slice(0, MAX_FILE_NAME)
}

// The folder a path is in; "" for the top of the repository.
export function parentFolder(path: string): string {
  const slash = path.lastIndexOf("/")
  return slash === -1 ? "" : path.slice(0, slash)
}

// What a folder holds directly: folders first, then files, each A to Z.
export function entriesInFolder(entries: TreeEntry[], folder: string): TreeEntry[] {
  return entries
    .filter((entry) => parentFolder(entry.path) === folder)
    .sort((a, b) => (a.type === b.type ? a.path.localeCompare(b.path) : a.type === "folder" ? -1 : 1))
}

// Files whose path holds what was typed, anywhere, ignoring case: the first `limit`.
export function matchFiles(entries: TreeEntry[], query: string, limit = 50): TreeEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  return entries.filter((entry) => entry.type === "file" && entry.path.toLowerCase().includes(needle)).slice(0, limit)
}

const FALLBACK_RETURN = "/settings?tab=account"

// Where to send someone after GitHub: a page on this site, or Settings.
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || value.length > 200 || !value.startsWith("/") || /[\u0000-\u001f\\]/.test(value)) return FALLBACK_RETURN
  const base = "https://devgram.invalid"
  const resolved = new URL(value, base)
  return resolved.origin === base ? `${resolved.pathname}${resolved.search}` : FALLBACK_RETURN
}

// The link that starts connecting GitHub, coming back to `returnTo`.
export function connectHref(returnTo: string): string {
  return `/api/github/connect?return=${encodeURIComponent(returnTo)}`
}

// What a page says when GitHub sends someone back with ?github=<result>.
export function githubReturnMessage(
  result: string | null,
  login: string | null,
): { kind: "success" | "error"; text: string } | null {
  if (result === "connected") return { kind: "success", text: login ? `Connected GitHub as @${login}` : "Connected GitHub" }
  if (result === "taken") return { kind: "error", text: TAKEN }
  if (result === "error") return { kind: "error", text: CONNECT_FAILED }
  if (result === "unavailable") return { kind: "error", text: NOT_SET_UP }
  return null
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/unit/github-links.test.mjs`
Expected: PASS.

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/github-links.ts scripts/unit/github-links.test.mjs
git commit -q -F - <<'EOF'
Read and build GitHub links: anchors, branches with slashes, return pages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 3: The GitHub client

**Files:**
- Create: `lib/http-error.ts`, `lib/github.ts`, `scripts/unit/github.test.mjs`
- Modify: `lib/http.ts` (`handleRouteError`)

**Interfaces:**
- Consumes:
  - Task 1 (`lib/code-files.ts`): `BAD_SOURCE`, `COMMIT_PATTERN`, `EMPTY_FILE`, `GITHUB_FILE_TOO_LONG`, `MAX_FILES`, `MAX_GITHUB_FILE_CHARS`, `displayLines`, `guessLanguage`, `parseGitHubSource`, `GitHubSource`.
  - Task 2 (`lib/github-links.ts`): the messages, `githubFileName`, `refCandidates`, and the types `GitHubLink`, `GitHubRepo`, `ResolvedLink`, `TreeEntry`, `GitHubFileResponse`.
- Produces:
  - `lib/http-error.ts`: `class HttpError extends Error { status: number; constructor(message: string, status: number) }`.
  - `lib/http.ts`: `handleRouteError` answers an `HttpError` with its own message and status.
  - `lib/github.ts`:
    - `MAX_TREE_ENTRIES = 10000`
    - `isGitHubSetUp(): boolean`
    - `listRepos(login: string): Promise<GitHubRepo[]>`
    - `resolveLink(link: GitHubLink): Promise<ResolvedLink>`
    - `listTree(owner: string, repo: string, commit: string): Promise<TreeEntry[]>`
    - `fetchGitHubFile(source: GitHubSource): Promise<GitHubFileResponse>`
    - `fillGitHubFiles(value: unknown): Promise<unknown>`
    - `authorizeUrl({ state, challenge, redirectUri }): string`
    - `exchangeCode({ code, verifier, redirectUri }): Promise<string>`
    - `readGitHubUser(token: string): Promise<{ id: number; login: string }>`
    - `deleteGrant(token: string): Promise<void>` (never throws)
  - Every failure is an `HttpError`, with these statuses:
    - `NOT_SET_UP` 503, `BUSY` 503, `UNREACHABLE` 502
    - `REPO_NOT_FOUND`, `FILE_NOT_FOUND`, `FOLDER_NOT_FOUND` and `ACCOUNT_GONE` 404
    - `TOO_BIG_TO_BROWSE`, `NOT_TEXT`, `GITHUB_FILE_TOO_LONG`, `EMPTY_FILE`, `BAD_SOURCE` and `CONNECT_FAILED` 400

- [ ] **Step 1: Write the failing test**

Create `scripts/unit/github.test.mjs`:

```js
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/unit/github.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/github.ts`.

- [ ] **Step 3: Write the error class**

Create `lib/http-error.ts`:

```ts
// An error a route answers with its own message and status (handleRouteError
// in lib/http.ts). It imports nothing, so modules the unit tests load can
// throw it.
export class HttpError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "HttpError"
    this.status = status
  }
}
```

In `lib/http.ts`, add the import under the existing ones:

```ts
import { HttpError } from "@/lib/http-error"
```

and make it the first check in `handleRouteError`:

```ts
export function handleRouteError(error: unknown, label: string, fallback: string) {
  if (error instanceof HttpError) return jsonError(error.message, error.status)
  if (error instanceof mongoose.Error.ValidationError) {
```

(the rest of the function stays as it is).

- [ ] **Step 4: Write the client**

Create `lib/github.ts`:

```ts
// Every call Devgram makes to GitHub. Public data is read with the OAuth
// app's own client ID and secret (GitHub allows 5,000 requests an hour for
// the whole site). A person's token is used only while connecting, to learn
// who they are, and then Devgram deletes its authorization (deleteGrant).
// Server only, with no Next.js imports, so the unit tests load it.
import { Buffer } from "node:buffer"
import {
  BAD_SOURCE,
  COMMIT_PATTERN,
  EMPTY_FILE,
  GITHUB_FILE_TOO_LONG,
  MAX_FILES,
  MAX_GITHUB_FILE_CHARS,
  displayLines,
  guessLanguage,
  parseGitHubSource,
  type GitHubSource,
} from "@/lib/code-files"
import {
  ACCOUNT_GONE,
  BUSY,
  CONNECT_FAILED,
  FILE_NOT_FOUND,
  FOLDER_NOT_FOUND,
  NOT_SET_UP,
  NOT_TEXT,
  REPO_NOT_FOUND,
  TOO_BIG_TO_BROWSE,
  UNREACHABLE,
  githubFileName,
  refCandidates,
  type GitHubFileResponse,
  type GitHubLink,
  type GitHubRepo,
  type ResolvedLink,
  type TreeEntry,
} from "@/lib/github-links"
import { HttpError } from "@/lib/http-error"

// The unit tests point these at a stand-in for GitHub.
const apiBase = () => process.env.GITHUB_API_URL || "https://api.github.com"
const webBase = () => process.env.GITHUB_WEB_URL || "https://github.com"
const TIMEOUT_MS = 10_000
// A repository with more entries than this isn't browsed: its list would be
// too much to send to a phone. Links to its files still work.
export const MAX_TREE_ENTRIES = 10_000
// UTF-8 takes at most 3 bytes for each character JavaScript counts, so a file
// bigger than this can't be within MAX_GITHUB_FILE_CHARS.
const MAX_FILE_BYTES = MAX_GITHUB_FILE_CHARS * 3

export function isGitHubSetUp(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
}

function credentials() {
  const id = process.env.GITHUB_CLIENT_ID
  const secret = process.env.GITHUB_CLIENT_SECRET
  if (!id || !secret) throw new HttpError(NOT_SET_UP, 503)
  return { id, secret }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

interface CallOptions {
  method?: string
  accept?: string
  body?: unknown
  // A person's token instead of the app's ID and secret.
  token?: string
}

// One request to GitHub's API. What isn't about the thing asked for becomes
// an HttpError here: rate limits (busy), and GitHub failing or out of reach.
async function call(path: string, { method = "GET", accept = "application/vnd.github+json", body, token }: CallOptions = {}) {
  const { id, secret } = credentials()
  const headers: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "devgram",
    Authorization: token ? `Bearer ${token}` : `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
  }
  if (body !== undefined) headers["Content-Type"] = "application/json"
  let response: Response
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new HttpError(UNREACHABLE, 502)
  }
  const limited =
    response.status === 429 ||
    (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")))
  if (limited) throw new HttpError(BUSY, 503)
  if (response.status >= 500) throw new HttpError(UNREACHABLE, 502)
  return response
}

const repoPath = (owner: string, repo: string) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`

// Someone's public repositories (their own, not ones they only contribute
// to), most recently pushed first, up to 100.
export async function listRepos(login: string): Promise<GitHubRepo[]> {
  const response = await call(`/users/${encodeURIComponent(login)}/repos?type=owner&sort=pushed&per_page=100`)
  if (!response.ok) throw new HttpError(ACCOUNT_GONE, 404)
  const repos = (await response.json()) as {
    name: string
    owner: { login: string }
    description: string | null
    language: string | null
    default_branch: string
  }[]
  return repos.map((repo) => ({
    owner: repo.owner.login,
    name: repo.name,
    description: repo.description ?? "",
    language: repo.language,
    defaultBranch: repo.default_branch,
  }))
}

// The full commit a branch, tag or commit names, or null when the
// repository has nothing by that name.
async function findCommit(owner: string, repo: string, ref: string): Promise<string | null> {
  const response = await call(`${repoPath(owner, repo)}/commits/${encodeURIComponent(ref)}`, { accept: "application/vnd.github.sha" })
  if (response.status === 404 || response.status === 422) return null
  if (!response.ok) throw new HttpError(REPO_NOT_FOUND, 404)
  const sha = (await response.text()).trim()
  return COMMIT_PATTERN.test(sha) ? sha : null
}

// A pasted link as a fixed place on GitHub: the repository as GitHub spells
// it, a full commit, and the folder or file.
export async function resolveLink(link: GitHubLink): Promise<ResolvedLink> {
  const response = await call(repoPath(link.owner, link.repo))
  if (!response.ok) throw new HttpError(REPO_NOT_FOUND, 404)
  const info = (await response.json()) as { name: string; owner: { login: string }; default_branch: string }
  const owner = info.owner.login
  const repo = info.name
  if (link.kind === "repo") {
    const commit = await findCommit(owner, repo, info.default_branch)
    // An empty repository has no commit to show.
    if (!commit) throw new HttpError(REPO_NOT_FOUND, 404)
    return { owner, repo, commit, kind: "repo", path: "", marked: null }
  }
  const file = link.kind === "blob"
  for (const { ref, path } of refCandidates(link.rest, file)) {
    const commit = await findCommit(owner, repo, ref)
    if (commit) return { owner, repo, commit, kind: file ? "file" : "folder", path, marked: file ? link.marked : null }
  }
  throw new HttpError(file ? FILE_NOT_FOUND : FOLDER_NOT_FOUND, 404)
}

// Every folder and file at a commit, in one call. Submodules (other
// repositories) and symlinks (a path, not code) are left out.
export async function listTree(owner: string, repo: string, commit: string): Promise<TreeEntry[]> {
  const response = await call(`${repoPath(owner, repo)}/git/trees/${commit}?recursive=1`)
  if (!response.ok) throw new HttpError(REPO_NOT_FOUND, 404)
  const data = (await response.json()) as {
    truncated?: boolean
    tree?: { path: string; mode: string; type: string; size?: number }[]
  }
  const tree = data.tree ?? []
  if (data.truncated || tree.length > MAX_TREE_ENTRIES) throw new HttpError(TOO_BIG_TO_BROWSE, 400)
  const entries: TreeEntry[] = []
  for (const item of tree) {
    if (item.type === "tree") entries.push({ path: item.path, type: "folder" })
    else if (item.type === "blob" && item.mode !== "120000") entries.push({ path: item.path, type: "file", size: item.size ?? 0 })
  }
  return entries
}

// A file's text at its commit, after the checks: it's a file (not a folder or
// a link), at most 100,000 characters (one too big for that by its size isn't
// decoded), text (valid UTF-8 without null characters), and not empty.
export async function fetchGitHubFile(source: GitHubSource): Promise<GitHubFileResponse> {
  const path = source.path.split("/").map(encodeURIComponent).join("/")
  const response = await call(`${repoPath(source.owner, source.repo)}/contents/${path}?ref=${source.commit}`)
  if (response.status === 404) throw new HttpError(FILE_NOT_FOUND, 404)
  if (!response.ok) throw new HttpError(REPO_NOT_FOUND, 404)
  const data: unknown = await response.json()
  if (!isRecord(data) || data.type !== "file") throw new HttpError(FILE_NOT_FOUND, 404)
  if (typeof data.size !== "number" || data.size > MAX_FILE_BYTES || data.encoding !== "base64" || typeof data.content !== "string") {
    throw new HttpError(GITHUB_FILE_TOO_LONG, 400)
  }
  let code: string
  try {
    code = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(data.content, "base64"))
  } catch {
    throw new HttpError(NOT_TEXT, 400)
  }
  if (code.includes("\u0000")) throw new HttpError(NOT_TEXT, 400)
  if (code.length > MAX_GITHUB_FILE_CHARS) throw new HttpError(GITHUB_FILE_TOO_LONG, 400)
  if (!code.trim()) throw new HttpError(EMPTY_FILE, 400)
  const name = githubFileName(source.path)
  return { name, language: guessLanguage(name) ?? "text", code, lineCount: displayLines(code).length, github: source }
}

// A post request's files with each GitHub file's code fetched from GitHub at
// its commit; code sent with it is replaced. Files written here, and lists
// the file rules will refuse anyway, pass through untouched.
export async function fillGitHubFiles(value: unknown): Promise<unknown> {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FILES) return value
  const filled: unknown[] = []
  for (const item of value) {
    if (!isRecord(item) || item.github == null) {
      filled.push(item)
      continue
    }
    const source = parseGitHubSource(item.github)
    if (!source) throw new HttpError(BAD_SOURCE, 400)
    const file = await fetchGitHubFile(source)
    filled.push({ ...item, github: source, code: file.code })
  }
  return filled
}

// GitHub's sign-in page for connecting. No scopes: GitHub asks only to let
// Devgram see the person's public profile.
export function authorizeUrl({ state, challenge, redirectUri }: { state: string; challenge: string; redirectUri: string }): string {
  const { id } = credentials()
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    allow_signup: "true",
  })
  return `${webBase()}/login/oauth/authorize?${params}`
}

// Trades the code GitHub sent back for the person's token.
export async function exchangeCode({ code, verifier, redirectUri }: { code: string; verifier: string; redirectUri: string }): Promise<string> {
  const { id, secret } = credentials()
  let response: Response
  try {
    response = await fetch(`${webBase()}/login/oauth/access_token`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "devgram" },
      body: JSON.stringify({ client_id: id, client_secret: secret, code, redirect_uri: redirectUri, code_verifier: verifier }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new HttpError(UNREACHABLE, 502)
  }
  const data = (await response.json().catch(() => null)) as { access_token?: unknown } | null
  const token = data?.access_token
  // GitHub answers a code it doesn't know with 200 and an `error` field.
  if (!response.ok || typeof token !== "string") throw new HttpError(CONNECT_FAILED, 400)
  return token
}

// Who a token belongs to: GitHub's account number and the username.
export async function readGitHubUser(token: string): Promise<{ id: number; login: string }> {
  const response = await call("/user", { token })
  const data = (await response.json().catch(() => null)) as { id?: unknown; login?: unknown } | null
  const id = data?.id
  const login = data?.login
  if (!response.ok || typeof id !== "number" || typeof login !== "string") throw new HttpError(CONNECT_FAILED, 400)
  return { id, login }
}

// Removes Devgram's authorization from the person's GitHub account, which
// revokes the token too. Never throws: the token is never stored either way.
export async function deleteGrant(token: string): Promise<void> {
  try {
    const { id } = credentials()
    const response = await call(`/applications/${encodeURIComponent(id)}/grant`, { method: "DELETE", body: { access_token: token } })
    if (response.status !== 204) console.error("Could not delete the GitHub authorization:", response.status)
  } catch (error) {
    console.error("Could not delete the GitHub authorization:", error instanceof Error ? error.message : error)
  }
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/unit/github.test.mjs`
Expected: PASS.

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/http-error.ts lib/http.ts lib/github.ts scripts/unit/github.test.mjs
git commit -q -F - <<'EOF'
Add the GitHub client: repositories, links, trees, files and connecting

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

- [ ] **Step 7: Stop for the GitHub app**

Ask the user to do "Before Task 4: the GitHub OAuth app" (above), and wait until `grep -cE '^GITHUB_CLIENT_(ID|SECRET)=.+' .env.local` prints 2.

---

### Task 4: Accounts remember GitHub; browsing routes

**Files:**
- Modify: `models/User.ts`, `lib/user-response.ts`, `app/api/users/[username]/route.ts`, `scripts/lib/test-users.mjs`, `scripts/smoke.mjs`
- Create: `app/api/github/repos/route.ts`, `app/api/github/resolve/route.ts`, `app/api/github/tree/route.ts`, `app/api/github/file/route.ts`

**Interfaces:**
- Consumes:
  - Task 1: `BAD_SOURCE`, `COMMIT_PATTERN`, `OWNER_PATTERN`, `isRepoName`, `parseGitHubSource`.
  - Task 2: `CONNECT_FIRST`, `NOT_A_LINK`, `parseGitHubLink`.
  - Task 3: `listRepos`, `resolveLink`, `listTree`, `fetchGitHubFile`, and `handleRouteError` answering `HttpError`s.
- Produces:
  - `IUser.github?: { id: number; login: string }`, with a unique sparse index on `github.id`.
  - `toPrivateUser(user).github: { login: string } | null`. `GET /api/users/:username` answers with `github: { login } | null`.
  - **Routes** (each needs the Bearer token; `HttpError`s become their own status and message):
    - `GET /api/github/repos` → `GitHubRepo[]`, or 409 "Connect GitHub first".
    - `GET /api/github/resolve?url=` → `ResolvedLink`, or 400 "That isn't a GitHub link".
    - `GET /api/github/tree?owner&repo&commit` → `{ entries: TreeEntry[] }`.
    - `GET /api/github/file?owner&repo&commit&path` → `GitHubFileResponse`.
  - **`scripts/lib/test-users.mjs`:**
    - `GITHUB_FIXTURE = { owner: "tmonga2208", repo: "devgram", commit: "ecfbc5c00e21e249fe201ddb81698fc80e5c79dc" }`
    - `setGitHubAccount(username, { id, login })`, which throws Mongo's duplicate-key error (code 11000) when that GitHub id is taken
    - `hasUniqueGitHubIndex(): Promise<boolean>`
  - **`scripts/smoke.mjs`:** a `github` section. Tasks 5 and 6 add to its end.

- [ ] **Step 1: Write the failing smoke checks**

In `scripts/lib/test-users.mjs`, append:

```js
// A public repository, and a commit on its default branch, that the GitHub
// checks read from GitHub. The files there never change.
export const GITHUB_FIXTURE = { owner: "tmonga2208", repo: "devgram", commit: "ecfbc5c00e21e249fe201ddb81698fc80e5c79dc" }

// Connects a test account to a GitHub account straight in the database, as
// the callback saves it: GitHub's sign-in page can't be automated. Throws
// Mongo's duplicate-key error (code 11000) when another account has that id.
export async function setGitHubAccount(username, github) {
  await withDatabase((db) => db.collection("users").updateOne({ username }, { $set: { github } }))
}

// Whether the users collection has the unique index on github.id that
// models/User.ts declares. Mongoose builds it when the app starts, so this
// waits up to 10 seconds for it.
export async function hasUniqueGitHubIndex() {
  return withDatabase(async (db) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const indexes = await db.collection("users").indexes()
      if (indexes.some((index) => index.key?.["github.id"] === 1 && index.unique && index.sparse)) return true
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    return false
  })
}
```

In `scripts/smoke.mjs`, change the `test-users.mjs` import to:

```js
import {
  GITHUB_FIXTURE,
  assertSameDatabase,
  hasUniqueGitHubIndex,
  insertLegacyCodePost,
  removeTestUsers,
  setGitHubAccount,
} from "./lib/test-users.mjs"
```

and add this section to `sections`, after `code()`:

```js
  async github() {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
      console.log("  skip github (GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET is not set)")
      return
    }
    await ensureUsers()
    const { a, b } = state
    const { owner, repo, commit } = GITHUB_FIXTURE
    const query = (values) => new URLSearchParams(values).toString()
    const isCommit = (value) => /^[0-9a-f]{40}$/.test(value ?? "")

    // Browsing needs a Devgram sign-in, so nobody else spends the site's GitHub requests.
    for (const path of [
      "/api/github/repos",
      `/api/github/resolve?${query({ url: `https://github.com/${owner}/${repo}` })}`,
      `/api/github/tree?${query({ owner, repo, commit })}`,
      `/api/github/file?${query({ owner, repo, commit, path: "lib/regex.ts" })}`,
    ]) {
      const res = await api("GET", path)
      check(`GET ${path.split("?")[0]} without a token is 401`, res.status === 401, `status ${res.status}`)
    }

    const resolve = (url) => api("GET", `/api/github/resolve?${query({ url })}`, { token: a.token })
    const front = await resolve(`https://github.com/${owner}/${repo}`)
    check(
      "a repository link resolves to its default branch's latest commit",
      front.status === 200 && front.data?.kind === "repo" && front.data?.owner === owner && front.data?.repo === repo && isCommit(front.data?.commit),
      front.text.slice(0, 200),
    )
    const marked = await resolve(`https://github.com/${owner}/${repo}/blob/${commit}/lib/code-files.ts#L80-L85`)
    check(
      "a file link at a commit keeps the commit, the path and the marked lines",
      marked.data?.kind === "file" && marked.data?.commit === commit && marked.data?.path === "lib/code-files.ts" &&
        marked.data?.marked?.from === 80 && marked.data?.marked?.to === 85,
      marked.text.slice(0, 200),
    )
    const onBranch = await resolve(`https://github.com/${owner}/${repo}/blob/master/lib/regex.ts`)
    check(
      "a file link on a branch resolves to a full commit",
      onBranch.data?.kind === "file" && isCommit(onBranch.data?.commit) && onBranch.data?.path === "lib/regex.ts",
      onBranch.text.slice(0, 200),
    )
    const folder = await resolve(`https://github.com/${owner}/${repo}/tree/${commit}/lib`)
    check("a folder link resolves to the folder", folder.data?.kind === "folder" && folder.data?.path === "lib", folder.text.slice(0, 200))
    for (const [what, url, status, message] of [
      ["something that isn't a link", "hello", 400, "That isn't a GitHub link"],
      ["a missing repository", `https://github.com/${owner}/no-such-repo-${run}`, 404, "That repository doesn't exist or is private"],
      ["a file link on a missing branch", `https://github.com/${owner}/${repo}/blob/no-such-branch-${run}/lib/regex.ts`, 404, "That file isn't in this repository"],
    ]) {
      const res = await resolve(url)
      check(`${what}: ${status} "${message}"`, res.status === status && res.data?.error === message, `status ${res.status} ${res.text.slice(0, 120)}`)
    }

    const tree = await api("GET", `/api/github/tree?${query({ owner, repo, commit })}`, { token: a.token })
    const entries = tree.data?.entries ?? []
    check(
      "the tree lists folders and files at the commit, with sizes",
      tree.status === 200 && entries.some((e) => e.path === "lib" && e.type === "folder") &&
        entries.some((e) => e.path === "lib/code-files.ts" && e.type === "file" && e.size === 6768),
      tree.text.slice(0, 200),
    )
    const branchTree = await api("GET", `/api/github/tree?${query({ owner, repo, commit: "master" })}`, { token: a.token })
    check("the tree wants a full commit", branchTree.status === 400, `status ${branchTree.status}`)

    const getFile = (path) => api("GET", `/api/github/file?${query({ owner, repo, commit, path })}`, { token: a.token })
    const codeFiles = await getFile("lib/code-files.ts")
    check(
      "a file comes back with its text, name, language and line count",
      codeFiles.status === 200 && codeFiles.data?.code?.startsWith("// Rules for the files in a code post") &&
        codeFiles.data?.name === "code-files.ts" && codeFiles.data?.language === "typescript" &&
        codeFiles.data?.lineCount === 126 && codeFiles.data?.github?.commit === commit,
      codeFiles.text.slice(0, 200),
    )
    state.githubCode = codeFiles.data?.code
    for (const [what, path, status, message] of [
      ["a path that isn't there", "lib/nope.ts", 404, "That file isn't in this repository"],
      ["a folder", "lib", 404, "That file isn't in this repository"],
      ["a picture", "public/icons/icon-192.png", 400, "This file isn't text, so it can't be shared"],
      ["a file over 100,000 characters", "package-lock.json", 400, "This file is over 100,000 characters"],
      ["a path that climbs out of the repository", "../package.json", 400, "Files from GitHub need an owner, a repository, a full commit and a path"],
    ]) {
      const res = await getFile(path)
      check(`a file request for ${what}: ${status} "${message}"`, res.status === status && res.data?.error === message, `status ${res.status} ${res.text.slice(0, 120)}`)
    }

    // The connection itself needs GitHub's sign-in page, so these checks set
    // it straight in the database, the way the callback saves it.
    const notConnected = await api("GET", "/api/github/repos", { token: a.token })
    check(
      `repositories before connecting: 409 "Connect GitHub first"`,
      notConnected.status === 409 && notConnected.data?.error === "Connect GitHub first",
      notConnected.text.slice(0, 120),
    )
    const before = await api("GET", `/api/users/${names.a}`)
    check("a profile without GitHub has github: null", before.status === 200 && before.data?.github === null, before.text.slice(0, 160))
    const githubId = 2_000_000_000 + Math.floor(Math.random() * 1_000_000)
    await setGitHubAccount(names.a, { id: githubId, login: owner })
    const repos = await api("GET", "/api/github/repos", { token: a.token })
    check(
      "a connected account lists its public repositories",
      repos.status === 200 && Array.isArray(repos.data) && repos.data.some((r) => r.owner === owner && r.name === repo && typeof r.defaultBranch === "string"),
      repos.text.slice(0, 200),
    )
    const profile = await api("GET", `/api/users/${names.a}`)
    check(
      "the public profile shows the GitHub username, and only that",
      profile.data?.github?.login === owner && Object.keys(profile.data.github).join() === "login",
      profile.text.slice(0, 160),
    )
    const me = await api("GET", "/api/users/profile", { token: a.token })
    check("your own account shows it too", me.data?.github?.login === owner, me.text.slice(0, 160))
    check("the users collection has a unique index on github.id", await hasUniqueGitHubIndex())
    let duplicate = null
    try {
      await setGitHubAccount(names.b, { id: githubId, login: owner })
    } catch (error) {
      duplicate = error
    }
    check("so a second account can't take the same GitHub account", duplicate?.code === 11000, duplicate ? duplicate.message : "the second account took it")
  },
```

- [ ] **Step 2: Run them to see them fail**

Start the dev server (see Dev server commands), then run: `env SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- github`
Expected: FAIL. The GitHub routes answer 404 (they don't exist yet), and the profile checks fail because there's no `github` field.

- [ ] **Step 3: Store the account on users**

In `models/User.ts`, add to `IUser` after `website?: string;`:

```ts
  // The GitHub account connected to this one (app/api/github): GitHub's
  // account number, which never changes, and the username when connected.
  // No token is kept.
  github?: { id: number; login: string };
```

add to the schema after the `website` field:

```ts
    github: {
      type: new mongoose.Schema(
        {
          id: { type: Number, required: true },
          login: { type: String, required: true },
        },
        { _id: false },
      ),
      required: false,
    },
```

and add after the existing `userSchema.index(...)` lines:

```ts
// One GitHub account per Devgram account, even when two connects race.
// Sparse, so accounts without GitHub don't collide.
userSchema.index({ 'github.id': 1 }, { unique: true, sparse: true });
```

In `lib/user-response.ts`, add to the object `toPrivateUser` returns, after `website`:

```ts
    github: user.github?.login ? { login: user.github.login } : null,
```

In `app/api/users/[username]/route.ts`:
- Change the select to `.select('username fullName avatar bio website github followers following isVerified')`.
- Add `github?: { login?: string };` to the `profile` type, after `website?: string;`.
- Add this line to the JSON answer, after `website`:

```ts
      github: profile.github?.login ? { login: profile.github.login } : null,
```

- [ ] **Step 4: Write the browsing routes**

Create `app/api/github/repos/route.ts`:

```ts
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { listRepos } from "@/lib/github"
import { CONNECT_FIRST } from "@/lib/github-links"
import { handleRouteError, jsonError } from "@/lib/http"
import { connectToDatabase } from "@/lib/mongodb"
import User from "@/models/User"

// Your public repositories, most recently pushed first, for the picker.
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    await connectToDatabase()
    const user = await User.findOne({ username: auth.username }).select("github").lean()
    const login = (user as { github?: { login?: string } } | null)?.github?.login
    if (!login) return jsonError(CONNECT_FIRST, 409)
    return NextResponse.json(await listRepos(login))
  } catch (error) {
    return handleRouteError(error, "GitHub repositories error", "Failed to list your repositories")
  }
}
```

Create `app/api/github/resolve/route.ts`:

```ts
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { resolveLink } from "@/lib/github"
import { NOT_A_LINK, parseGitHubLink } from "@/lib/github-links"
import { handleRouteError, jsonError } from "@/lib/http"

// A pasted link, or a repository from the list, as a fixed place on GitHub.
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const link = parseGitHubLink(new URL(req.url).searchParams.get("url") ?? "")
    if (!link) return jsonError(NOT_A_LINK, 400)
    return NextResponse.json(await resolveLink(link))
  } catch (error) {
    return handleRouteError(error, "GitHub link error", "Failed to open the link")
  }
}
```

Create `app/api/github/tree/route.ts`:

```ts
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { BAD_SOURCE, COMMIT_PATTERN, OWNER_PATTERN, isRepoName } from "@/lib/code-files"
import { listTree } from "@/lib/github"
import { handleRouteError, jsonError } from "@/lib/http"

// Every folder and file of a repository at a commit.
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const params = new URL(req.url).searchParams
    const owner = params.get("owner") ?? ""
    const repo = params.get("repo") ?? ""
    const commit = params.get("commit") ?? ""
    if (!OWNER_PATTERN.test(owner) || !isRepoName(repo) || !COMMIT_PATTERN.test(commit)) return jsonError(BAD_SOURCE, 400)
    return NextResponse.json({ entries: await listTree(owner, repo, commit) })
  } catch (error) {
    return handleRouteError(error, "GitHub tree error", "Failed to list the repository")
  }
}
```

Create `app/api/github/file/route.ts`:

```ts
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { BAD_SOURCE, parseGitHubSource } from "@/lib/code-files"
import { fetchGitHubFile } from "@/lib/github"
import { handleRouteError, jsonError } from "@/lib/http"

// One file's text at a commit, checked, with its suggested name and language.
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const params = new URL(req.url).searchParams
    const source = parseGitHubSource({
      owner: params.get("owner"),
      repo: params.get("repo"),
      commit: params.get("commit"),
      path: params.get("path"),
    })
    if (!source) return jsonError(BAD_SOURCE, 400)
    return NextResponse.json(await fetchGitHubFile(source))
  } catch (error) {
    return handleRouteError(error, "GitHub file error", "Failed to fetch the file")
  }
}
```

- [ ] **Step 5: Run the checks to see them pass**

Restart the dev server, because the User model changed. Then run:
`env SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- users github`
Expected: every check passes, and cleanup removes both test users. `users` is included to show the profile changes didn't break anything.

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add models/User.ts lib/user-response.ts "app/api/users/[username]/route.ts" app/api/github scripts/lib/test-users.mjs scripts/smoke.mjs
git commit -q -F - <<'EOF'
Remember a connected GitHub account; browse repositories, links, trees and files

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 5: Posting files from GitHub

**Files:**
- Modify: `models/Post.ts`, `app/api/posts/route.ts`, `contexts/posts-context.tsx`, `scripts/smoke.mjs`

**Interfaces:**
- Consumes:
  - Task 1: `CodeFile` (now with `github` and `marked`), `FileRequest`, `parseFiles`.
  - Task 3: `fillGitHubFiles(value: unknown): Promise<unknown>`.
  - Task 4: the `github` smoke section, `GITHUB_FIXTURE`, and `state.githubCode` (the fixture's `lib/code-files.ts` as GitHub serves it).
- Produces:
  - Post files store `github` and `marked`.
  - `POST /api/posts` accepts `{ name, language, github, marked? }` files and fetches their code from GitHub.
  - `NewPost.files` is `FileRequest[]`.

- [ ] **Step 1: Write the failing smoke checks**

In `scripts/smoke.mjs`, add at the end of the `github` section, before its closing `},`:

```js
    // Posting: the server fetches each GitHub file's code itself, at its commit.
    const post = (files) => api("POST", "/api/posts", { token: a.token, body: { caption: `github ${run}`, files } })
    const fromGitHub = (path, extra = {}) => ({ name: path.split("/").pop(), language: "typescript", github: { owner, repo, commit, path }, ...extra })
    const real = await post([fromGitHub("lib/code-files.ts", { code: "not what GitHub has", marked: { from: 80, to: 85 } })])
    const stored = real.data?.files?.[0]
    check(
      "a GitHub file posts with the code GitHub has at that commit, not code the request sent",
      real.status === 201 && typeof state.githubCode === "string" && stored?.code === state.githubCode,
      `status ${real.status} ${real.text.slice(0, 160)}`,
    )
    check(
      "it keeps its source and marked lines",
      JSON.stringify(stored?.github) === JSON.stringify({ owner, repo, commit, path: "lib/code-files.ts" }) && stored?.marked?.from === 80 && stored?.marked?.to === 85,
      JSON.stringify({ github: stored?.github, marked: stored?.marked }),
    )
    state.githubPostId = real.data?._id
    const reread = await api("GET", `/api/posts/${real.data?._id}`)
    check("reading the post back gives the same file", reread.data?.files?.[0]?.code === state.githubCode && reread.data?.files?.[0]?.marked?.to === 85)
    const mixed = await post([fromGitHub("lib/regex.ts"), { name: "notes.txt", language: "text", code: "written here" }])
    check(
      "GitHub files and written files mix, in order; the post's language is the first file's",
      mixed.status === 201 && mixed.data?.files?.map((f) => f.name).join(" ") === "regex.ts notes.txt" &&
        mixed.data?.language === "typescript" && mixed.data?.files?.[1]?.github === undefined,
      mixed.text.slice(0, 200),
    )
    const big = "x".repeat(20000)
    const badSource = "Files from GitHub need an owner, a repository, a full commit and a path"
    for (const [what, files, status, message] of [
      ["a branch name in place of a commit", [fromGitHub("lib/regex.ts", { github: { owner, repo, commit: "master", path: "lib/regex.ts" } })], 400, badSource],
      ["a path that climbs out of the repository", [fromGitHub("lib/regex.ts", { github: { owner, repo, commit, path: "../x.ts" } })], 400, badSource],
      ["a file that isn't there", [fromGitHub("lib/nope.ts")], 404, "That file isn't in this repository"],
      ["marks past the end of the file", [fromGitHub("lib/code-files.ts", { marked: { from: 120, to: 127 } })], 400, "Marked lines must be inside the file"],
      ["marks on a written file", [{ name: "a.js", language: "javascript", code: "x", marked: { from: 1, to: 1 } }], 400, "Only files from GitHub can have marked lines"],
      [
        "files over 100,000 characters together",
        [fromGitHub("scripts/mobile-check.mjs", { language: "javascript" }), { name: "a.js", language: "javascript", code: big }, { name: "b.js", language: "javascript", code: big }],
        400,
        "A post's files can add up to 100,000 characters",
      ],
      ["two GitHub files with one name", [fromGitHub("lib/regex.ts"), fromGitHub("lib/regex.ts")], 400, "Two files can't have the same name"],
    ]) {
      const res = await post(files)
      check(`posting ${what}: ${status} "${message}"`, res.status === status && res.data?.error === message, `status ${res.status} ${res.text.slice(0, 120)}`)
    }
    const renamed = await post([fromGitHub("lib/regex.ts"), fromGitHub("lib/regex.ts", { name: "regex-copy.ts" })])
    check("renaming one of them posts both", renamed.status === 201, `status ${renamed.status} ${renamed.text.slice(0, 120)}`)
```

- [ ] **Step 2: Run them to see them fail**

Run: `env SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- github`
Expected: FAIL. Without code, a GitHub file gets "Files must be a list of { name, language, code }". With code, the post stores the code the request sent, and the Post model drops the `github` and `marked` fields because it doesn't have them yet.

- [ ] **Step 3: Store GitHub files and fetch their code**

In `models/Post.ts`, add `import type { CodeFile } from '@/lib/code-files';` under the mongoose import. Replace the `files?: { name: string; language: string; code: string }[];` line in `IPost` with:

```ts
  files?: CodeFile[];
```

and replace the subdocument schema inside `files` with:

```ts
        new mongoose.Schema(
          {
            name: { type: String, default: '' },
            language: { type: String, required: true },
            code: { type: String, required: true },
            // A file taken from GitHub (lib/github.ts): where, at which commit.
            github: {
              type: new mongoose.Schema(
                {
                  owner: { type: String, required: true },
                  repo: { type: String, required: true },
                  commit: { type: String, required: true },
                  path: { type: String, required: true },
                },
                { _id: false },
              ),
              required: false,
            },
            // The lines a GitHub file points out, counted from 1.
            marked: {
              type: new mongoose.Schema(
                {
                  from: { type: Number, required: true },
                  to: { type: Number, required: true },
                },
                { _id: false },
              ),
              required: false,
            },
          },
          { _id: false },
        ),
```

In `app/api/posts/route.ts`, add `import { fillGitHubFiles } from '@/lib/github';` to the imports. Replace the block that parses files:

```ts
    let files: CodeFile[] | undefined;
    if (body.files !== undefined || oldCode) {
      const parsed = parseFiles(
        body.files !== undefined
          ? body.files
          : [{ name: '', language: optionalString(body.language) ?? 'javascript', code: oldCode }],
      );
      if ('error' in parsed) return jsonError(parsed.error, 400);
      files = parsed.files;
    }
```

with:

```ts
    let files: CodeFile[] | undefined;
    if (body.files !== undefined || oldCode) {
      // A GitHub file's code comes from GitHub, at its commit, never from the
      // request (fillGitHubFiles answers GitHub's problems as HttpErrors).
      const parsed = parseFiles(
        body.files !== undefined
          ? await fillGitHubFiles(body.files)
          : [{ name: '', language: optionalString(body.language) ?? 'javascript', code: oldCode }],
      );
      if ('error' in parsed) return jsonError(parsed.error, 400);
      files = parsed.files;
    }
```

In `contexts/posts-context.tsx`, change `import type { CodeFile } from '@/lib/code-files';` to `import type { FileRequest } from '@/lib/code-files';`, and in `NewPost` change `files?: CodeFile[];` to:

```ts
  // GitHub files go without their code: the server fetches it from GitHub.
  files?: FileRequest[];
```

- [ ] **Step 4: Run the checks to see them pass**

Restart the dev server, because the Post model changed. Then run:
`env SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- posts code github`
Expected: every check passes. `posts` and `code` are included to show written code posts didn't change.

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add models/Post.ts app/api/posts/route.ts contexts/posts-context.tsx scripts/smoke.mjs
git commit -q -F - <<'EOF'
Post files from GitHub with the code GitHub has at their commit

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 6: Connecting and disconnecting

**Files:**
- Create: `lib/tokens.ts`, `lib/github-connect.ts`, `scripts/unit/github-connect.test.mjs`, `app/api/github/connect/route.ts`, `app/api/github/callback/route.ts`
- Modify: `lib/auth.ts` (whole file below), `scripts/smoke.mjs`

**Interfaces:**
- Consumes:
  - Task 2: `safeReturnPath`.
  - Task 3: `authorizeUrl`, `exchangeCode`, `readGitHubUser`, `deleteGrant`, `isGitHubSetUp`.
  - Task 4: `IUser.github`, `toPrivateUser`, the `github` smoke section.
  - Task 5: `state.githubPostId`.
- Produces:
  - **`lib/tokens.ts`:** `AuthUser`, `signToken(user)`, `verifyToken(token): Promise<AuthUser | null>`, `signPayload(payload: Record<string, string>, seconds: number): Promise<string>`, `verifyPayload(token): Promise<Record<string, unknown> | null>`, `readCookie(req: Request, name: string): string | null`.
  - **`lib/auth.ts`:** unchanged exports (`AuthUser`, `signToken`, `getAuthUser`, `requireAuth`), plus `getCookieUser(req): Promise<AuthUser | null>`.
  - **`lib/github-connect.ts`:**
    - `CONNECT_COOKIE = "github_connect"`, `CONNECT_SECONDS = 600`
    - `interface ConnectAttempt { state; verifier; userId; returnTo }`
    - `challengeFor(verifier: string): string`
    - `startConnect(userId: string, returnTo: string | null): Promise<{ cookie: string; attempt: ConnectAttempt }>`
    - `readConnect(cookie: string | null): Promise<ConnectAttempt | null>`
    - `returnUrl(origin: string, returnTo: string, result: string, login?: string): URL`
    - `connectCookieOptions(secure: boolean, maxAge: number)`
  - **Routes:**
    - `GET /api/github/connect?return=` redirects to GitHub's authorize page (or to `/login`, or back with `github=unavailable`).
    - `DELETE /api/github/connect` → your account (`toPrivateUser`) without GitHub.
    - `GET /api/github/callback` redirects to the return page with `github=connected&github_login=…`, `taken`, `cancelled` or `error`.

- [ ] **Step 1: Write the failing unit test**

Create `scripts/unit/github-connect.test.mjs`:

```js
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/unit/github-connect.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/github-connect.ts`.

- [ ] **Step 3: Move the token helpers and add the connect cookie**

Create `lib/tokens.ts`:

```ts
// The app's signed tokens: the login token, and small signed records such as
// the GitHub connect cookie. No Next.js imports, so the unit tests load it.
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

// The user a login token names, or null for a malformed, altered or expired one.
export async function verifyToken(token: string): Promise<AuthUser | null> {
  const secret = getSecret()
  try {
    const { payload } = await jwtVerify(token, secret)
    if (typeof payload.id !== "string" || typeof payload.username !== "string" || typeof payload.email !== "string") {
      return null
    }
    return { id: payload.id, username: payload.username, email: payload.email }
  } catch {
    return null
  }
}

// Signs a small record with the app's secret, valid for `seconds`.
export async function signPayload(payload: Record<string, string>, seconds: number) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${seconds}s`).sign(getSecret())
}

// A record signPayload made, or null when it was altered or has expired.
export async function verifyPayload(token: string): Promise<Record<string, unknown> | null> {
  const secret = getSecret()
  try {
    return (await jwtVerify(token, secret)).payload as Record<string, unknown>
  } catch {
    return null
  }
}

// A cookie's value from a request, or null.
export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=")
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return null
    }
  }
  return null
}
```

Replace `lib/auth.ts` with:

```ts
import { NextResponse } from "next/server"
import { readCookie, verifyToken, type AuthUser } from "@/lib/tokens"

export { signToken, type AuthUser } from "@/lib/tokens"

// Returns null for a missing, malformed or expired token.
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const header = req.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) return null
  const token = header.slice(7).trim()
  return token ? verifyToken(token) : null
}

// The signed-in user from the `token` cookie the browser keeps for
// middleware.ts: for links the browser follows, which carry no header.
export async function getCookieUser(req: Request): Promise<AuthUser | null> {
  const token = readCookie(req, "token")
  return token ? verifyToken(token) : null
}

export async function requireAuth(req: Request): Promise<AuthUser | NextResponse> {
  const user = await getAuthUser(req)
  return user ?? NextResponse.json({ error: "Authentication required" }, { status: 401 })
}
```

Create `lib/github-connect.ts`:

```ts
// The 10-minute cookie that carries a connect attempt from Devgram to GitHub
// and back: a random state (so nobody can attach their GitHub account to
// yours with a crafted link), the PKCE verifier, who started it and where to
// return. Signed, so it can't be altered.
import { createHash, randomBytes } from "node:crypto"
import { safeReturnPath } from "@/lib/github-links"
import { signPayload, verifyPayload } from "@/lib/tokens"

export const CONNECT_COOKIE = "github_connect"
// How long connecting may take, GitHub's sign-in page included.
export const CONNECT_SECONDS = 600
// Tells this record apart from a login token, which the same secret signs.
const PURPOSE = "github-connect"

export interface ConnectAttempt {
  state: string
  verifier: string
  userId: string
  returnTo: string
}

const random = () => randomBytes(32).toString("base64url")

// PKCE's S256 challenge: the verifier's SHA-256, in base64url.
export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url")
}

export async function startConnect(userId: string, returnTo: string | null): Promise<{ cookie: string; attempt: ConnectAttempt }> {
  const attempt: ConnectAttempt = { state: random(), verifier: random(), userId, returnTo: safeReturnPath(returnTo) }
  return { cookie: await signPayload({ ...attempt, purpose: PURPOSE }, CONNECT_SECONDS), attempt }
}

// The attempt a cookie carries, or null when it's missing, altered, expired
// or not a connect cookie.
export async function readConnect(cookie: string | null): Promise<ConnectAttempt | null> {
  const payload = cookie ? await verifyPayload(cookie) : null
  if (!payload || payload.purpose !== PURPOSE) return null
  const { state, verifier, userId, returnTo } = payload
  if (typeof state !== "string" || typeof verifier !== "string" || typeof userId !== "string" || typeof returnTo !== "string") {
    return null
  }
  return { state, verifier, userId, returnTo: safeReturnPath(returnTo) }
}

// The page to send someone back to, saying how connecting went.
export function returnUrl(origin: string, returnTo: string, result: string, login?: string): URL {
  const url = new URL(safeReturnPath(returnTo), origin)
  url.searchParams.set("github", result)
  if (login) url.searchParams.set("github_login", login)
  return url
}

// Only the GitHub routes see the cookie, scripts never do, and the live site
// sends it over HTTPS only.
export function connectCookieOptions(secure: boolean, maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/api/github", maxAge }
}
```

- [ ] **Step 4: Run the unit tests to see them pass**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/unit/github-connect.test.mjs`
Expected: PASS.

- [ ] **Step 5: Write the failing smoke checks**

In `scripts/smoke.mjs`, add at the end of the `github` section, before its closing `},`:

```js
    // Connecting: everything up to GitHub's sign-in page, and every way the return can fail.
    const go = (path, cookies = {}) =>
      fetch(`${BASE}${path}`, {
        redirect: "manual",
        headers: { cookie: Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join("; ") },
      })
    const connectCookie = (res) =>
      (res.headers.getSetCookie().find((c) => c.startsWith("github_connect=")) ?? "").split(";")[0].slice("github_connect=".length)
    const signedOutStart = await go("/api/github/connect?return=%2Fcreate%3Ftab%3Dcode")
    const toLogin = new URL(signedOutStart.headers.get("location") ?? "/", BASE)
    check(
      "connecting while signed out goes to the login page",
      signedOutStart.status === 307 && toLogin.pathname === "/login" && toLogin.searchParams.get("from") === "/create?tab=code",
      `${signedOutStart.status} ${toLogin.href}`,
    )
    const start = await go("/api/github/connect?return=%2Fcreate%3Ftab%3Dcode", { token: a.token })
    const authorize = new URL(start.headers.get("location") ?? "/", BASE)
    check(
      "connecting sends you to GitHub's sign-in page, asking for no permissions",
      start.status === 307 && `${authorize.origin}${authorize.pathname}` === "https://github.com/login/oauth/authorize" &&
        authorize.searchParams.get("client_id") === process.env.GITHUB_CLIENT_ID &&
        authorize.searchParams.get("redirect_uri") === `${BASE}/api/github/callback` &&
        authorize.searchParams.get("code_challenge_method") === "S256" &&
        (authorize.searchParams.get("code_challenge") ?? "").length === 43 && !authorize.searchParams.has("scope"),
      authorize.href,
    )
    const setCookie = start.headers.getSetCookie().find((c) => c.startsWith("github_connect=")) ?? ""
    check(
      "it sets a 10-minute, browser-only cookie that only the GitHub routes see",
      /HttpOnly/i.test(setCookie) && /Path=\/api\/github/i.test(setCookie) && /Max-Age=600/i.test(setCookie) && /SameSite=lax/i.test(setCookie),
      setCookie,
    )
    const attempt = connectCookie(start)
    const oauthState = authorize.searchParams.get("state")
    const returnFrom = async (query, cookies) => {
      const res = await go(`/api/github/callback?${query}`, cookies)
      const target = new URL(res.headers.get("location") ?? "/", BASE)
      const cleared = res.headers.getSetCookie().some((c) => c.startsWith("github_connect=") && /Max-Age=0/i.test(c))
      return { target, result: target.searchParams.get("github"), cleared }
    }
    const noCookie = await returnFrom(`code=x&state=${oauthState}`, { token: a.token })
    check("a return without the cookie fails, back to Settings", noCookie.result === "error" && noCookie.target.pathname === "/settings", noCookie.target.href)
    const wrongState = await returnFrom("code=x&state=wrong", { token: a.token, github_connect: attempt })
    check(
      "a return with the wrong state fails, back where you started, and clears the cookie",
      wrongState.result === "error" && wrongState.target.pathname === "/create" && wrongState.target.searchParams.get("tab") === "code" && wrongState.cleared,
      wrongState.target.href,
    )
    const someoneElse = await returnFrom(`code=x&state=${oauthState}`, { token: b.token, github_connect: attempt })
    check("a return signed in as someone else fails", someoneElse.result === "error", someoneElse.target.href)
    const signedOutReturn = await returnFrom(`code=x&state=${oauthState}`, { github_connect: attempt })
    check("a return without a sign-in fails", signedOutReturn.result === "error", signedOutReturn.target.href)
    const badCode = await returnFrom(`code=not-a-real-code&state=${oauthState}`, { token: a.token, github_connect: attempt })
    check("a code GitHub doesn't know fails", badCode.result === "error", badCode.target.href)
    const cancelled = await returnFrom(`error=access_denied&state=${oauthState}`, { token: a.token, github_connect: attempt })
    check("pressing Cancel on GitHub comes back quietly", cancelled.result === "cancelled", cancelled.target.href)
    const elsewhere = connectCookie(await go("/api/github/connect?return=%2F%2Fevil.com", { token: a.token }))
    const elsewhereReturn = await returnFrom("code=x&state=wrong", { token: a.token, github_connect: elsewhere })
    check(
      "a return page on another site becomes Settings",
      elsewhereReturn.target.origin === new URL(BASE).origin && elsewhereReturn.target.pathname === "/settings",
      elsewhereReturn.target.href,
    )

    // Disconnecting forgets the account; posts made from GitHub stay.
    const anonymous = await api("DELETE", "/api/github/connect")
    check("disconnecting without a token is 401", anonymous.status === 401, `status ${anonymous.status}`)
    const disconnect = await api("DELETE", "/api/github/connect", { token: a.token })
    check(
      "disconnecting forgets the GitHub account",
      disconnect.status === 200 && disconnect.data?.github === null && disconnect.data?.username === names.a,
      disconnect.text.slice(0, 160),
    )
    const afterDisconnect = await api("GET", `/api/users/${names.a}`)
    check("and the profile stops showing it", afterDisconnect.data?.github === null, afterDisconnect.text.slice(0, 160))
    const kept = await api("GET", `/api/posts/${state.githubPostId}`)
    check("posts made from GitHub stay as they were", kept.data?.files?.[0]?.github?.repo === repo, kept.text.slice(0, 160))
```

Run: `env SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- github`
Expected: FAIL. The connect and callback routes don't exist yet, so they answer 404 with no `location`.

- [ ] **Step 6: Write the routes**

Create `app/api/github/connect/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getCookieUser, requireAuth } from "@/lib/auth"
import { authorizeUrl, isGitHubSetUp } from "@/lib/github"
import { CONNECT_COOKIE, CONNECT_SECONDS, challengeFor, connectCookieOptions, returnUrl, startConnect } from "@/lib/github-connect"
import { safeReturnPath } from "@/lib/github-links"
import { handleRouteError, jsonError } from "@/lib/http"
import { connectToDatabase } from "@/lib/mongodb"
import { toPrivateUser } from "@/lib/user-response"
import User from "@/models/User"

// Starts connecting GitHub. It's a plain link, so the sign-in cookie (the one
// middleware.ts reads) says who is connecting.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const returnTo = safeReturnPath(url.searchParams.get("return"))
  try {
    if (!isGitHubSetUp()) return NextResponse.redirect(returnUrl(url.origin, returnTo, "unavailable"))
    const user = await getCookieUser(req)
    if (!user) {
      const login = new URL("/login", url.origin)
      login.searchParams.set("from", returnTo)
      return NextResponse.redirect(login)
    }
    const { cookie, attempt } = await startConnect(user.id, returnTo)
    const response = NextResponse.redirect(
      authorizeUrl({ state: attempt.state, challenge: challengeFor(attempt.verifier), redirectUri: `${url.origin}/api/github/callback` }),
    )
    response.cookies.set(CONNECT_COOKIE, cookie, connectCookieOptions(url.protocol === "https:", CONNECT_SECONDS))
    return response
  } catch (error) {
    console.error("GitHub connect start error:", error)
    return NextResponse.redirect(returnUrl(url.origin, returnTo, "error"))
  }
}

// Disconnects GitHub: the account is forgotten; posts made from GitHub stay.
export async function DELETE(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    await connectToDatabase()
    const user = await User.findOneAndUpdate({ username: auth.username }, { $unset: { github: 1 } }, { new: true })
    if (!user) return jsonError("Authentication required", 401)
    return NextResponse.json(toPrivateUser(user))
  } catch (error) {
    return handleRouteError(error, "GitHub disconnect error", "Failed to disconnect GitHub")
  }
}
```

Create `app/api/github/callback/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getCookieUser } from "@/lib/auth"
import { deleteGrant, exchangeCode, readGitHubUser } from "@/lib/github"
import { CONNECT_COOKIE, connectCookieOptions, readConnect, returnUrl } from "@/lib/github-connect"
import { connectToDatabase } from "@/lib/mongodb"
import { readCookie } from "@/lib/tokens"
import User from "@/models/User"

// Where GitHub sends people back after its sign-in page. Saves the GitHub
// account on the Devgram account that started connecting, then returns to
// where they began with ?github=connected, taken, cancelled or error.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const attempt = await readConnect(readCookie(req, CONNECT_COOKIE))
  const finish = (result: string, login?: string) => {
    const response = NextResponse.redirect(returnUrl(url.origin, attempt?.returnTo ?? "", result, login))
    response.cookies.set(CONNECT_COOKIE, "", connectCookieOptions(url.protocol === "https:", 0))
    return response
  }
  if (!attempt) return finish("error")
  if (url.searchParams.get("error") === "access_denied") return finish("cancelled")
  const code = url.searchParams.get("code")
  // The state proves this return belongs to the attempt this browser started.
  if (!code || url.searchParams.get("state") !== attempt.state) return finish("error")
  const user = await getCookieUser(req)
  if (!user || user.id !== attempt.userId) return finish("error")
  try {
    const token = await exchangeCode({ code, verifier: attempt.verifier, redirectUri: `${url.origin}/api/github/callback` })
    let account: { id: number; login: string }
    try {
      account = await readGitHubUser(token)
    } finally {
      // Devgram never needs GitHub's permission again, so nothing is left behind.
      await deleteGrant(token)
    }
    await connectToDatabase()
    const saved = await User.findByIdAndUpdate(user.id, { github: account }, { new: true })
    return saved ? finish("connected", account.login) : finish("error")
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return finish("taken")
    console.error("GitHub connect error:", error)
    return finish("error")
  }
}
```

- [ ] **Step 7: Run everything to see it pass**

Run: `env SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- auth users github`
Expected: every check passes. `auth` and `users` show that logging in and profiles still work after the token helpers moved.

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add lib/tokens.ts lib/auth.ts lib/github-connect.ts scripts/unit/github-connect.test.mjs app/api/github/connect app/api/github/callback scripts/smoke.mjs
git commit -q -F - <<'EOF'
Connect and disconnect GitHub: state and PKCE, no scopes, no token kept

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 7: The code view shows GitHub files and marked lines

**Files:**
- Create: `components/github-mark.tsx`
- Modify: `lib/code-highlight.ts`, `scripts/unit/code-highlight.test.mjs`, `components/highlighted-code.tsx` (whole file below), `components/code-view.tsx` (whole file below), `scripts/mobile-check.mjs`

**Interfaces:**
- Consumes:
  - Task 1: `MarkedLines`, `markedWindow`, `markedLabel`, `displayLines`, `FEED_LINES`.
  - Task 2: `githubFileUrl`.
  - Task 4: `GITHUB_FIXTURE`.
  - Task 5: posting GitHub files.
- Produces:
  - `highlightLines(code: string, language: string): Highlighted[][]`.
  - `GitHubMark({ className?: string })`.
  - `HighlightedCode` props: `code`, `language`, `first?`, `last?`, `marked?: MarkedLines | null`, `onLineClick?: (line: number, shift: boolean) => void`. The `maxLines` prop goes away.
  - **Markup the phone checks read:**
    - Line numbers: `[data-line-numbers] > *` (one per line shown), `[data-marked]` on marked numbers, and with `onLineClick` the numbers are `button[data-line="<n>"]`.
    - Code view: `[data-github-source]`, `[data-github-label]`, `a[data-github-view]`, `[data-hidden-lines]`, `[data-marked-label]` (screen reader text) and `[data-show-all]`.
  - `scripts/mobile-check.mjs`: `seed()` also returns `githubPostId` (null without the GitHub keys), plus a module-level `githubView(scopeExpression)` page script.

- [ ] **Step 1: Write the failing unit tests**

In `scripts/unit/code-highlight.test.mjs`, change `const { highlight } = await import("../../lib/code-highlight.ts")` to:

```js
const { highlight, highlightLines } = await import("../../lib/code-highlight.ts")
```

and append:

```js
test("splits highlighted code into lines, keeping colours across them", () => {
  const lines = highlightLines("/* one\ntwo */\nconst x = `a\nb`\n", "javascript")
  assert.deepEqual(lines.map(text), ["/* one", "two */", "const x = `a", "b`"])
  assert.ok(classes(lines[1]).some((name) => name.split(" ").includes("comment")), "the comment's second line keeps its colour")
  assert.ok(classes(lines[3]).some((name) => name.includes("string")), "the string's second line keeps its colour")
})

test("splits into the lines the code view counts", () => {
  assert.deepEqual(highlightLines("a\r\nb\r\n", "text").map(text), ["a", "b"])
  assert.deepEqual(highlightLines("x\n\n", "python").map(text), ["x", ""])
  assert.deepEqual(highlightLines("", "javascript").map(text), [""])
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/unit/code-highlight.test.mjs`
Expected: FAIL with `TypeError: highlightLines is not a function`.

- [ ] **Step 3: Highlight line by line**

In `lib/code-highlight.ts`, change `import { languageById } from "@/lib/code-files"` to `import { displayLines, languageById } from "@/lib/code-files"`, and append:

```ts
// Splits highlighted pieces at line breaks. A token that spans lines becomes
// one token per line, with the same classes.
function splitLines(pieces: Highlighted[]): Highlighted[][] {
  const lines: Highlighted[][] = [[]]
  for (const piece of pieces) {
    const parts: Highlighted[][] =
      typeof piece === "string"
        ? piece.split("\n").map((part) => (part ? [part] : []))
        : splitLines(piece.content).map((content) => (content.length > 0 ? [{ classes: piece.classes, content }] : []))
    parts.forEach((part, index) => {
      if (index > 0) lines.push([])
      lines[lines.length - 1].push(...part)
    })
  }
  return lines
}

// The code's highlighted pieces, line by line, as displayLines counts lines.
// Colours are worked out on the whole file first, so a line inside a long
// comment or string keeps the colour it has there.
export function highlightLines(code: string, language: string): Highlighted[][] {
  return splitLines(highlight(displayLines(code).join("\n"), language))
}
```

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/unit/code-highlight.test.mjs`
Expected: PASS.

- [ ] **Step 4: Write the failing phone checks**

In `scripts/mobile-check.mjs`, change the `test-users.mjs` import to:

```js
import { GITHUB_FIXTURE, assertSameDatabase, insertLegacyCodePost, removeTestUsers } from "./lib/test-users.mjs"
```

In `seed()`, just before `// Mux videos for the playback checks`, add:

```js
  // A file from GitHub with lines 80–85 marked, when the app can reach GitHub.
  let githubPostId = null
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    githubPostId = (
      await api("POST", "/api/posts", a.token, {
        caption: `github file ${run}`,
        files: [{ name: "code-files.ts", language: "typescript", github: { ...GITHUB_FIXTURE, path: "lib/code-files.ts" }, marked: { from: 80, to: 85 } }],
      })
    )._id
  }
```

and change its `return` to `return { a, b, postId: code._id, videoPostId, devbits, codePosts, githubPostId }`.

After the `textPlacement` page script, add:

```js
// A code view showing a GitHub file: its header line, the lines shown and
// which of them are marked, the hidden-lines rows and Show whole file.
const githubView = (scope) => `(() => {
  const view = ${scope}?.querySelector("[data-code-view]")
  if (!view) return null
  const source = view.querySelector("[data-github-source]")
  const numbers = [...view.querySelectorAll("[data-line-numbers] > *")]
  const showAll = view.querySelector("[data-show-all]")
  const link = view.querySelector("[data-github-view]")
  return {
    label: view.querySelector("[data-github-label]")?.textContent ?? null,
    sourceFits: source ? source.scrollWidth <= source.clientWidth + 1 : false,
    link: link?.getAttribute("href") ?? null,
    linkHeight: link ? link.getBoundingClientRect().height : 0,
    first: numbers[0]?.textContent ?? null,
    count: numbers.length,
    marked: numbers.filter((n) => n.hasAttribute("data-marked")).map((n) => n.textContent).join(","),
    hidden: view.querySelectorAll("[data-hidden-lines]").length,
    spoken: view.querySelector("[data-marked-label]")?.textContent ?? null,
    showAll: showAll ? { text: showAll.textContent.trim(), height: showAll.getBoundingClientRect().height } : null,
  }
})()`
```

In `main()`, change `const { a, b, postId, videoPostId, devbits, codePosts } = await seed()` to `const { a, b, postId, videoPostId, devbits, codePosts, githubPostId } = await seed()`. Then, right after the check `"feed: a code post stored the old way shows its code under one Python label"` (before `console.log("\n[running code]")`), add:

```js
    console.log("\n[github posts]")
    if (!githubPostId) {
      console.log("  skip github posts (GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET is not set)")
    } else {
      const fixtureLink = `https://github.com/${GITHUB_FIXTURE.owner}/${GITHUB_FIXTURE.repo}/blob/${GITHUB_FIXTURE.commit}/lib/code-files.ts#L80-L85`
      const fixtureLabel = `${GITHUB_FIXTURE.owner}/${GITHUB_FIXTURE.repo} · lib/code-files.ts`
      await open(page, "/")
      const feedView = await page.evaluate(githubView(card(githubPostId)))
      check("feed, GitHub file: a second header line names the repository and path", feedView?.label === fixtureLabel, JSON.stringify(feedView))
      check("feed, GitHub file: View on GitHub opens the file at its commit, at the marked lines", feedView?.link === fixtureLink, feedView?.link)
      check(`feed, GitHub file: View on GitHub is at least ${TAP_TARGET}px tall`, feedView?.linkHeight >= TAP_TARGET, `${feedView?.linkHeight}px`)
      check("feed, GitHub file: the header line fits the card", feedView?.sourceFits === true)
      check(
        "feed, GitHub file: opens on lines 77 to 88, the marked 80–85 and 3 either side",
        feedView?.first === "77" && feedView?.count === 12,
        `starts at ${feedView?.first}, ${feedView?.count} lines`,
      )
      check("feed, GitHub file: lines 80 to 85 are marked", feedView?.marked === "80,81,82,83,84,85", feedView?.marked)
      check("feed, GitHub file: rows show where lines are hidden, above and below", feedView?.hidden === 2, `${feedView?.hidden} rows`)
      check("feed, GitHub file: screen readers hear which lines are marked", feedView?.spoken === "Marked lines 80 to 85", feedView?.spoken)
      check(
        `feed, GitHub file: Show whole file says how long the file is and is at least ${TAP_TARGET}px tall`,
        feedView?.showAll?.text === "Show whole file (126 lines)" && feedView.showAll.height >= TAP_TARGET,
        JSON.stringify(feedView?.showAll),
      )
      await page.evaluate(click(`${card(githubPostId)}?.querySelector("[data-show-all]")`))
      check(
        "feed, GitHub file: Show whole file shows all 126 lines, still marked",
        await page.waitFor(
          `(() => { const v = ${githubView(card(githubPostId))}; return v && v.first === "1" && v.count === 126 && v.marked === "80,81,82,83,84,85" && v.hidden === 0 && !v.showAll })()`,
          { timeout: 5000 },
        ),
      )
      await open(page, `/p/${githubPostId}`)
      await shellChecks(page, "GitHub post", { back: true, tabs })
      const postView = await page.evaluate(githubView(`document.querySelector("main")`))
      check(
        "GitHub post page: opens on the marked lines too",
        postView?.first === "77" && postView?.count === 12 && postView?.showAll?.text === "Show whole file (126 lines)",
        JSON.stringify(postView),
      )
    }
```

In the `[small phone]` section, after the check `"small phone, a 300-character line: fits the width of the screen"`, add:

```js
    if (githubPostId) {
      await open(page, `/p/${githubPostId}`)
      const smallGitHub = await page.evaluate(SHELL)
      check("small phone, GitHub post: fits the width of the screen", fitsScreen(smallGitHub, SMALL_PHONE), widthDetail(smallGitHub, SMALL_PHONE))
      const smallView = await page.evaluate(githubView(`document.querySelector("main")`))
      check("small phone, GitHub post: the header line shortens instead of widening the page", smallView?.sourceFits === true, JSON.stringify(smallView))
    }
```

Run `PHONE_CHECK` with the dev server running.
Expected: the `[github posts]` checks FAIL, because the view has no GitHub line or window yet. The checks from before still pass.

- [ ] **Step 5: Draw GitHub's mark, lines with real numbers, and the GitHub line**

Create `components/github-mark.tsx`:

```tsx
// GitHub's mark, from GitHub's Octicons (mark-github). Lucide's brand icons
// are deprecated, so this one is drawn here.
export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  )
}
```

Replace `components/highlighted-code.tsx` with:

```tsx
import { Fragment, useMemo } from "react"
import "prismjs/themes/prism-tomorrow.css"
import type { MarkedLines } from "@/lib/code-files"
import { highlightLines, type Highlighted } from "@/lib/code-highlight"
import { cn } from "@/lib/utils"

function Pieces({ pieces }: { pieces: Highlighted[] }) {
  return (
    <>
      {pieces.map((piece, index) =>
        typeof piece === "string" ? (
          <Fragment key={index}>{piece}</Fragment>
        ) : (
          <span key={index} className={piece.classes}>
            <Pieces pieces={piece.content} />
          </span>
        ),
      )}
    </>
  )
}

interface HighlightedCodeProps {
  code: string
  language: string
  // Show only these lines, counted from 1, both included; all by default.
  first?: number
  last?: number
  // Lines to tint, with a bar by their numbers.
  marked?: MarkedLines | null
  // Makes the line numbers buttons, for marking lines in the Code tab.
  onLineClick?: (line: number, shift: boolean) => void
}

// Code with a number on each line and Prism's colours. Long lines scroll
// sideways inside the block while the numbers stay put. Each line spans the
// block's whole width, so a marked line's tint does too.
export function HighlightedCode({ code, language, first = 1, last, marked, onLineClick }: HighlightedCodeProps) {
  const lines = useMemo(() => highlightLines(code, language), [code, language])
  const shown = lines.slice(first - 1, Math.min(last ?? lines.length, lines.length))
  const isMarked = (line: number) => Boolean(marked && line >= marked.from && line <= marked.to)
  return (
    <div className="flex bg-zinc-950 font-mono text-[13px] leading-5 text-zinc-200">
      <div aria-hidden="true" data-line-numbers className="shrink-0 select-none border-r border-zinc-800 py-3 text-right text-zinc-500">
        {shown.map((_, index) => {
          const line = first + index
          const mark = isMarked(line)
          const style = cn(
            "block w-full border-l-2 pl-3 pr-2 text-right",
            mark ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-transparent",
          )
          return onLineClick ? (
            <button
              key={line}
              type="button"
              tabIndex={-1}
              data-line={line}
              data-marked={mark || undefined}
              className={cn(style, "hover:text-zinc-100")}
              onClick={(event) => onLineClick(line, event.shiftKey)}
            >
              {line}
            </button>
          ) : (
            <div key={line} data-marked={mark || undefined} className={style}>
              {line}
            </div>
          )
        })}
      </div>
      <pre className="m-0 min-w-0 flex-1 overflow-x-auto py-3 [tab-size:4]">
        <code className="block w-max min-w-full">
          {shown.map((pieces, index) => (
            <Fragment key={first + index}>
              {index > 0 && "\n"}
              <span className={cn("inline-block min-h-5 min-w-full px-3 align-top", isMarked(first + index) && "bg-amber-400/15")}>
                <Pieces pieces={pieces} />
              </span>
            </Fragment>
          ))}
        </code>
      </pre>
    </div>
  )
}
```

Replace `components/code-view.tsx` with:

```tsx
"use client"

import { useCallback, useState } from "react"
import { Copy, ExternalLink, Play, Square } from "lucide-react"
import toast from "react-hot-toast"
import { CodeRun } from "@/components/code-run"
import { GitHubMark } from "@/components/github-mark"
import { HighlightedCode } from "@/components/highlighted-code"
import { FEED_LINES, displayLines, languageLabel, markedLabel, markedWindow, type CodeFile } from "@/lib/code-files"
import { runKind } from "@/lib/code-run"
import { githubFileUrl } from "@/lib/github-links"
import { cn } from "@/lib/utils"

export const COPY_FAILED = "Couldn't copy — select the code instead"

// The header's buttons: at least 44px tall on phones.
const headerButton =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white md:min-h-9"

interface CodeViewProps {
  files: CodeFile[]
  // In the feed, what's shown of a file folds at 20 lines.
  fold?: boolean
}

// Where a GitHub file came from, and a link to it there, at its commit.
function GitHubSource({ file }: { file: CodeFile }) {
  if (!file.github) return null
  const label = `${file.github.owner}/${file.github.repo} · ${file.github.path}`
  return (
    <div data-github-source className="flex items-center gap-2 border-b border-zinc-800 pl-3 pr-1 text-sm text-zinc-400">
      <GitHubMark className="h-4 w-4 shrink-0" />
      <span data-github-label title={label} className="min-w-0 flex-1 truncate">
        {label}
      </span>
      <a href={githubFileUrl(file.github, file.marked)} target="_blank" rel="noopener noreferrer" data-github-view className={headerButton}>
        View on GitHub
        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

// A row standing for lines the view leaves out.
function HiddenLines() {
  return (
    <div aria-hidden="true" data-hidden-lines className="select-none bg-zinc-900 px-3 text-xs leading-5 text-zinc-500">
      ⋯
    </div>
  )
}

// A code post's files, the same in the feed and on the post page: a tab per
// file (or the one file's name or language), Copy, Run where the files can
// run, line numbers and colours. A GitHub file adds where it came from, and
// one with marked lines opens on them.
export function CodeView({ files, fold = false }: CodeViewProps) {
  const [active, setActive] = useState(0)
  // Show all (or Show whole file) was pressed: every line shows.
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  // Each Run starts a new frame; `running` turns off when a JavaScript run ends.
  const [run, setRun] = useState<{ id: number; running: boolean } | null>(null)
  const canRun = runKind(files) !== null
  const toggleRun = () => setRun((current) => (current?.running ? null : { id: (current?.id ?? 0) + 1, running: true }))
  const finished = useCallback(
    (id: number) => setRun((current) => (current?.id === id ? { id, running: false } : current)),
    [],
  )
  const current = Math.min(active, files.length - 1)
  const file = files[current]
  const lineCount = displayLines(file.code).length
  const marked = file.marked ?? null
  // A marked file opens on its marks with lines either side; others start at
  // the top. In the feed, what's shown folds at 20 lines.
  const range = marked && !expanded ? markedWindow(lineCount, marked) : { first: 1, last: lineCount }
  const first = range.first
  const last = fold && !expanded ? Math.min(range.last, first + FEED_LINES - 1) : range.last
  const cut = first > 1 || last < lineCount

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(COPY_FAILED)
    }
  }

  return (
    <div data-code-view className="w-full overflow-hidden bg-zinc-950 text-zinc-200">
      <div className="flex items-center gap-1 border-b border-zinc-800 px-1">
        {files.length > 1 ? (
          <div
            role="tablist"
            aria-label="Files"
            className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {files.map((item, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={index === current}
                data-file-tab
                onClick={() => setActive(index)}
                className={cn(
                  "min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 text-sm md:min-h-9",
                  index === current ? "border-sky-400 text-white" : "border-transparent text-zinc-400 hover:text-zinc-200",
                )}
              >
                {item.name}
              </button>
            ))}
          </div>
        ) : (
          <span className="min-w-0 flex-1 truncate px-3 text-sm text-zinc-400">{file.name || languageLabel(file.language)}</span>
        )}
        <button type="button" data-copy onClick={copy} className={headerButton}>
          {copied ? (
            "Copied ✓"
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy
            </>
          )}
        </button>
        {canRun && (
          <button type="button" data-run onClick={toggleRun} className={headerButton}>
            {run?.running ? (
              <>
                <Square className="h-4 w-4" />
                Stop
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run
              </>
            )}
          </button>
        )}
      </div>
      <GitHubSource file={file} />
      {marked && (
        <p data-marked-label className="sr-only">
          {markedLabel(marked)}
        </p>
      )}
      {marked && first > 1 && <HiddenLines />}
      <HighlightedCode code={file.code} language={file.language} first={first} last={last} marked={marked} />
      {marked && last < lineCount && <HiddenLines />}
      {cut && (
        <button
          type="button"
          data-show-all
          onClick={() => setExpanded(true)}
          className="min-h-11 w-full border-t border-zinc-800 text-sm text-sky-400 hover:bg-zinc-900 md:min-h-9"
        >
          {marked ? `Show whole file (${lineCount} lines)` : "Show all"}
        </button>
      )}
      {run && <CodeRun key={run.id} files={files} onFinish={() => finished(run.id)} />}
    </div>
  )
}
```

- [ ] **Step 6: Run the checks to see them pass**

Run `PHONE_CHECK`.
Expected: every check passes, including `[github posts]`, the small phone's GitHub post, and the code posts checks from before (folding at 20 lines, Show all, three files).

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add lib/code-highlight.ts scripts/unit/code-highlight.test.mjs components/github-mark.tsx components/highlighted-code.tsx components/code-view.tsx scripts/mobile-check.mjs
git commit -q -F - <<'EOF'
Show where a GitHub file came from and open marked files on their lines

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 8: Profiles and Settings show the connection

**Files:**
- Create: `components/github-settings.tsx`, `hooks/use-github-return.ts`
- Modify: `contexts/auth-context.tsx`, `lib/types.ts`, `components/profile.tsx`, `app/settings/page.tsx`, `scripts/mobile-check.mjs`

**Interfaces:**
- Consumes:
  - Task 2: `connectHref`, `githubReturnMessage`.
  - Task 4: `github: { login } | null` in profile answers, and `setGitHubAccount`.
  - Task 6: `DELETE /api/github/connect`.
  - Task 7: `GitHubMark`.
- Produces:
  - `User.github?: { login: string } | null` in the auth context, plus `disconnectGitHub(): Promise<void>`.
  - `UserType.github: { login: string } | null`.
  - `useGitHubReturn()`: toasts `githubReturnMessage(?github, ?github_login)` once, then removes both from the address.
  - `GitHubSettings` (`[data-github-settings]`). The profile link is `a[data-github-link]`. `/settings?tab=<profile|account|notifications|privacy>` opens that tab.
  - `scripts/mobile-check.mjs`: `seed()` connects `names.a` to `GITHUB_FIXTURE.owner` and returns `githubId`.

- [ ] **Step 1: Write the failing phone checks**

In `scripts/mobile-check.mjs`, add `setGitHubAccount` to the `test-users.mjs` import:

```js
import { GITHUB_FIXTURE, assertSameDatabase, insertLegacyCodePost, removeTestUsers, setGitHubAccount } from "./lib/test-users.mjs"
```

In `seed()`, right after `const { a, b } = users`, add:

```js
  // A connected GitHub account, saved the way the callback saves one: GitHub's
  // sign-in page can't be automated.
  const githubId = 2_000_000_000 + Math.floor(Math.random() * 1_000_000)
  await setGitHubAccount(names.a, { id: githubId, login: GITHUB_FIXTURE.owner })
```

and add `githubId` to its `return` object. In `main()`, add `githubId` to the names taken from `await seed()`.

In `[main tabs]`, right after `await textChecks(page, "own profile", { "a long username": names.a, "a long link in the bio": LONG_LINK })`, add:

```js
    const githubLink = await page.evaluate(`(() => {
      const link = document.querySelector("main [data-github-link]")
      return link && { href: link.getAttribute("href"), text: link.textContent.trim() }
    })()`)
    check(
      "own profile: shows the connected GitHub account, linking to it",
      githubLink?.href === `https://github.com/${GITHUB_FIXTURE.owner}` && githubLink.text === GITHUB_FIXTURE.owner,
      JSON.stringify(githubLink),
    )
    await textChecks(page, "own profile", { "the GitHub link": GITHUB_FIXTURE.owner })
```

Right before `console.log("\n[back arrow]")`, add:

```js
    console.log("\n[github settings]")
    await open(page, "/settings?tab=account")
    const githubSettings = `document.querySelector("main [data-github-settings]")`
    check(
      "settings: ?tab=account opens the Account tab, which shows the GitHub connection",
      await page.waitFor(`${githubSettings}?.textContent.includes("Connected as @${GITHUB_FIXTURE.owner}")`, { timeout: 5000 }),
    )
    const disconnectHeight = await page.evaluate(buttonHeight("Disconnect"))
    check(`settings: Disconnect is at least ${TAP_TARGET}px tall`, disconnectHeight >= TAP_TARGET, `height ${disconnectHeight}px`)
    await page.evaluate(click(`[...document.querySelectorAll("main [data-github-settings] button")].find((b) => b.textContent.trim() === "Disconnect")`))
    const connectLink = `[...document.querySelectorAll("main [data-github-settings] a")].find((a) => a.textContent.includes("Connect GitHub"))`
    check(
      "settings: Disconnect forgets the account and offers Connect GitHub, coming back to this tab",
      await page.waitFor(`${connectLink}?.getAttribute("href") === "/api/github/connect?return=%2Fsettings%3Ftab%3Daccount"`, { timeout: 5000 }),
    )
    const connectHeight = await page.evaluate(`${connectLink}?.getBoundingClientRect().height ?? 0`)
    check(`settings: Connect GitHub is at least ${TAP_TARGET}px tall`, connectHeight >= TAP_TARGET, `height ${connectHeight}px`)
    // Connected again for the checks that follow, the way the callback saves it.
    await setGitHubAccount(names.a, { id: githubId, login: GITHUB_FIXTURE.owner })
    await open(page, `/settings?github=connected&github_login=${GITHUB_FIXTURE.owner}`)
    check(
      "settings: coming back from GitHub says so",
      await page.waitFor(`document.body.textContent.includes("Connected GitHub as @${GITHUB_FIXTURE.owner}")`, { timeout: 5000 }),
    )
    check("settings: and takes the note out of the address", (await page.evaluate("location.search")) === "")
```

Run `PHONE_CHECK`.
Expected: the profile link and `[github settings]` checks FAIL. Nothing shows GitHub yet, and `?tab=account` doesn't open the Account tab.

- [ ] **Step 2: Carry GitHub in the signed-in user, and disconnect**

In `contexts/auth-context.tsx`:
- Add `github?: { login: string } | null;` to `User`, after `website?: string;`.
- Add `disconnectGitHub: () => Promise<void>;` to `AuthContextType`, after `updateProfile`.
- Add this function after `updateProfile`:

```ts
  const disconnectGitHub = async () => {
    const response = await authFetch('/api/github/connect', { method: 'DELETE' });
    const updated = await response.json().catch(() => null);
    if (!response.ok || !updated) {
      throw new Error(updated?.error || 'Failed to disconnect GitHub');
    }
    storeUser(updated as User);
  };
```

- Add `disconnectGitHub,` to the provider's `value`, after `updateProfile,`.

In `lib/types.ts`, add to `UserType` after `website: string`:

```ts
  // The connected GitHub account (app/api/github), shown on the profile.
  github: { login: string } | null
```

- [ ] **Step 3: Say how connecting went**

Create `hooks/use-github-return.ts`:

```ts
"use client"

import { useEffect } from "react"
import toast from "react-hot-toast"
import { githubReturnMessage } from "@/lib/github-links"

// After GitHub sends someone back (?github=…), says how connecting went, once,
// and takes the note out of the address.
export function useGitHubReturn() {
  useEffect(() => {
    const url = new URL(window.location.href)
    const result = url.searchParams.get("github")
    if (!result) return
    const message = githubReturnMessage(result, url.searchParams.get("github_login"))
    url.searchParams.delete("github")
    url.searchParams.delete("github_login")
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
    if (message) (message.kind === "success" ? toast.success : toast.error)(message.text)
  }, [])
}
```

- [ ] **Step 4: Show the connection in Settings and on the profile**

Create `components/github-settings.tsx`:

```tsx
"use client"

import { useState } from "react"
import toast from "react-hot-toast"
import { GitHubMark } from "@/components/github-mark"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { connectHref } from "@/lib/github-links"

// Settings → Account: connect GitHub (it then shows on your profile and
// lists your repositories in Create), or see the connection and end it.
export function GitHubSettings() {
  const { user, disconnectGitHub } = useAuth()
  const [busy, setBusy] = useState(false)
  const login = user?.github?.login

  const disconnect = async () => {
    setBusy(true)
    try {
      await disconnectGitHub()
      toast.success("Disconnected GitHub")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect GitHub")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section data-github-settings className="mt-8 space-y-3 rounded-lg border p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <GitHubMark className="h-4 w-4" />
        GitHub
      </h2>
      {login ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 wrap-anywhere">
            Connected as{" "}
            <a href={`https://github.com/${login}`} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
              @{login}
            </a>
          </p>
          <Button type="button" variant="outline" onClick={disconnect} disabled={busy} className="min-h-11 md:min-h-9">
            Disconnect
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Show your GitHub on your profile and pick files from your repositories.</p>
          <Button asChild className="min-h-11 md:min-h-9">
            <a href={connectHref("/settings?tab=account")}>
              <GitHubMark className="h-4 w-4" />
              Connect GitHub
            </a>
          </Button>
        </>
      )}
    </section>
  )
}
```

In `app/settings/page.tsx`:
- Change `import { useState } from "react"` to `import { useEffect, useState } from "react"`.
- Add `import { GitHubSettings } from "@/components/github-settings"` and `import { useGitHubReturn } from "@/hooks/use-github-return"`.
- Add `const TABS = ["profile", "account", "notifications", "privacy"]` above the component.
- Put this right after `const [activeTab, setActiveTab] = useState("profile")`, so it comes before the `if (!user)` return:

```tsx
  // ?tab=account opens that tab (connecting GitHub comes back to it), and
  // ?github=… says how connecting went.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab")
    if (tab && TABS.includes(tab)) setActiveTab(tab)
  }, [])
  useGitHubReturn()
```

- Make the account tab:

```tsx
        <TabsContent value="account" className="mt-6">
          <AccountSettings />
          <GitHubSettings />
        </TabsContent>
```

In `components/profile.tsx`, add `import { GitHubMark } from "@/components/github-mark"`, and right after the website link's closing `)}` (still inside `<div className="max-w-full wrap-anywhere">`) add:

```tsx
            {user.github && (
              <p>
                <a
                  href={`https://github.com/${user.github.login}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-github-link
                  className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
                >
                  <GitHubMark className="h-4 w-4 shrink-0" />
                  {user.github.login}
                </a>
              </p>
            )}
```

- [ ] **Step 5: Run the checks to see them pass**

Run `PHONE_CHECK`.
Expected: every check passes, including the profile's GitHub link and `[github settings]`. The settings tab rows (4) and the small phone's settings page still fit.

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add contexts/auth-context.tsx lib/types.ts hooks/use-github-return.ts components/github-settings.tsx app/settings/page.tsx components/profile.tsx scripts/mobile-check.mjs
git commit -q -F - <<'EOF'
Show the connected GitHub account on profiles and in Settings

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 9: Create: the From GitHub picker and the GitHub file panel

**Files:**
- Create: `lib/code-draft.ts`, `scripts/unit/code-draft.test.mjs`, `components/github-file-panel.tsx`, `components/github-picker.tsx`
- Modify: `components/code-files-editor.tsx` (whole file below), `components/create-post-form.tsx`, `scripts/mobile-check.mjs`

**Interfaces:**
- Consumes:
  - Task 1: `markFromClick`, `parseMarkInput`, `MAX_FILES`, `GitHubSource`, `MarkedLines`.
  - Task 2: `entriesInFolder`, `matchFiles`, `parentFolder`, `connectHref`, `FOLDER_NOT_FOUND`, `UNREACHABLE`, and the answer types.
  - Task 4: the browsing routes.
  - Task 5: posting `FileRequest`s.
  - Task 7: `HighlightedCode` with `marked` and `onLineClick`, and `GitHubMark`.
  - Task 8: `user.github` in the auth context, and `useGitHubReturn`.
- Produces:
  - **`lib/code-draft.ts`:** `interface CodeDraft { caption: string; files: CodeFile[] }`, `readDraft(raw: string | null): CodeDraft | null`, `saveDraft(draft: CodeDraft)`, `takeDraft(): CodeDraft | null`. Storage key: `devgram:code-draft`.
  - **`GitHubFilePanel({ file, source, onMarked })`:** `[data-github-file]`, with the boxes `#marked-from` and `#marked-to`.
  - **`GitHubPicker({ open, onOpenChange, onPick, onConnect })`** and `interface PickedFile { name; language; code; github: GitHubSource; marked: MarkedLines | null }`. Its markup: `[data-github-picker]`, `[data-github-link-input]`, `[data-github-repo="<name>"]` and `[data-github-entry="<path>"]`.
  - **`CodeFilesEditor`** takes `onConnectGitHub: () => void`. `newDraftFile(language?, fields?)` always makes a new key.

- [ ] **Step 1: Write the failing unit test**

Create `scripts/unit/code-draft.test.mjs`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import "./app-alias.mjs"

const { readDraft } = await import("../../lib/code-draft.ts")

test("reads back a kept Code tab post, GitHub files included", () => {
  const draft = {
    caption: "look at this",
    files: [
      { name: "a.ts", language: "typescript", code: "x", github: { owner: "o", repo: "r", commit: "a".repeat(40), path: "a.ts" }, marked: { from: 1, to: 1 } },
      { name: "b.js", language: "javascript", code: "" },
    ],
  }
  assert.deepEqual(readDraft(JSON.stringify(draft)), draft)
})

test("anything else reads as no draft", () => {
  for (const raw of [
    null,
    "",
    "not json",
    "null",
    "[]",
    "{}",
    JSON.stringify({ caption: 1, files: [{ name: "", language: "go", code: "" }] }),
    JSON.stringify({ caption: "", files: [] }),
    JSON.stringify({ caption: "", files: [{ name: "a" }] }),
    JSON.stringify({ caption: "", files: [null] }),
    JSON.stringify({ caption: "", files: Array.from({ length: 6 }, () => ({ name: "", language: "go", code: "" })) }),
  ]) {
    assert.equal(readDraft(raw), null, String(raw))
  }
})
```

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/unit/code-draft.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/code-draft.ts`.

- [ ] **Step 2: Keep the post while connecting**

Create `lib/code-draft.ts`:

```ts
// The Code tab's post, kept in sessionStorage while you connect GitHub, so
// it's there again when GitHub sends you back. Storage can be blocked (some
// private windows); the post then simply starts empty.
import { MAX_FILES, type CodeFile } from "@/lib/code-files"

const KEY = "devgram:code-draft"

export interface CodeDraft {
  caption: string
  files: CodeFile[]
}

// A kept draft, checked: anything that isn't one reads as no draft.
export function readDraft(raw: string | null): CodeDraft | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const { caption, files } = value as { caption?: unknown; files?: unknown }
  if (typeof caption !== "string" || !Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) return null
  const isFile = (file: unknown) => {
    if (typeof file !== "object" || file === null) return false
    const { name, language, code } = file as Record<string, unknown>
    return typeof name === "string" && typeof language === "string" && typeof code === "string"
  }
  return files.every(isFile) ? { caption, files: files as CodeFile[] } : null
}

export function saveDraft(draft: CodeDraft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    // Storage is blocked: the post will start empty again.
  }
}

// The kept draft, once: reading it removes it.
export function takeDraft(): CodeDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return readDraft(raw)
  } catch {
    return null
  }
}
```

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/unit/code-draft.test.mjs`
Expected: PASS.

- [ ] **Step 3: Write the failing phone checks**

In `scripts/mobile-check.mjs`, right after the check `"create, code: the post appears in the feed with both files"` (before `console.log("\n[messages]")`), add:

```js
    console.log("\n[from github]")
    if (!githubPostId) {
      console.log("  skip from github (GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET is not set)")
    } else {
      const picker = `document.querySelector("[data-github-picker]")`
      const fromGitHubButton = `[...document.querySelectorAll("main button")].find((b) => b.textContent.includes("From GitHub"))`
      const repoRow = `${picker}?.querySelector('[data-github-repo="${GITHUB_FIXTURE.repo}"]')`
      const entry = (path) => `${picker}?.querySelector('[data-github-entry="${path}"]')`
      const tabNames = `[...document.querySelectorAll("main [data-file-tab]")].map((tab) => tab.textContent.trim()).join(" ")`
      const panelState = `(() => {
        const panel = document.querySelector("main [data-github-file]")
        return panel && {
          label: panel.querySelector("[data-github-label]")?.textContent ?? null,
          editable: Boolean(document.querySelector("main textarea#code, main .monaco-editor")),
          from: document.querySelector("main #marked-from")?.value,
          to: document.querySelector("main #marked-to")?.value,
          marked: [...panel.querySelectorAll("[data-line-numbers] [data-marked]")].map((n) => n.textContent).join(","),
        }
      })()`
      await openCodeTab(page)
      const fromHeight = await page.evaluate(buttonHeight("From GitHub"))
      check(`create, code: From GitHub is at least ${TAP_TARGET}px tall`, fromHeight >= TAP_TARGET, `height ${fromHeight}px`)
      await page.evaluate(click(fromGitHubButton))
      check("create, from GitHub: the picker opens", await page.waitFor(picker, { timeout: 5000 }))
      await sleep(400)
      const pickerBox = await page.evaluate(`(() => {
        const box = ${picker}.getBoundingClientRect()
        return { left: box.left, top: box.top, width: box.width, height: box.height, scrollWidth: ${picker}.scrollWidth }
      })()`)
      check(
        "create, from GitHub: on a phone the picker fills the screen",
        pickerBox.left === 0 && pickerBox.top === 0 && pickerBox.width === PHONE.width && Math.abs(pickerBox.height - PHONE.height) <= 1 && pickerBox.scrollWidth <= PHONE.width,
        JSON.stringify(pickerBox),
      )
      check("create, from GitHub: your repositories are listed", await page.waitFor(repoRow, { timeout: 20000 }))
      const repoHeight = await page.evaluate(`${repoRow}.getBoundingClientRect().height`)
      check(`create, from GitHub: repository rows are at least ${TAP_TARGET}px tall`, repoHeight >= TAP_TARGET, `height ${repoHeight}px`)

      // A pasted file link with lines arrives as a read-only tab with those lines marked.
      await page.type(
        "[data-github-picker] [data-github-link-input]",
        `https://github.com/${GITHUB_FIXTURE.owner}/${GITHUB_FIXTURE.repo}/blob/${GITHUB_FIXTURE.commit}/lib/regex.ts#L2-L3`,
      )
      await page.evaluate(click(`[...${picker}.querySelectorAll("button")].find((b) => b.textContent.trim() === "Open")`))
      check(
        "create, from GitHub: a pasted file link replaces the empty file and closes the picker",
        await page.waitFor(`!${picker} && ${tabNames} === "regex.ts"`, { timeout: 20000 }),
        await page.evaluate(tabNames),
      )
      const panel = await page.evaluate(panelState)
      check(
        "create, from GitHub: the code is read-only and says where it's from",
        panel?.editable === false && panel?.label === `${GITHUB_FIXTURE.owner}/${GITHUB_FIXTURE.repo} · lib/regex.ts`,
        JSON.stringify(panel),
      )
      check("create, from GitHub: the link's lines arrive marked", panel?.from === "2" && panel?.to === "3" && panel?.marked === "2,3", JSON.stringify(panel))
      const codeTab = await page.evaluate(SHELL)
      check("create, from GitHub: the Code tab with a GitHub file fits the width of the screen", fitsScreen(codeTab, PHONE), widthDetail(codeTab, PHONE))
      const boxHeight = await page.evaluate(`document.querySelector("main #marked-from")?.getBoundingClientRect().height ?? 0`)
      check(`create, from GitHub: the Lines boxes are at least ${TAP_TARGET}px tall`, boxHeight >= TAP_TARGET, `height ${boxHeight}px`)
      // A range typed backwards marks it the right way round.
      const retype = async (selector, text) => {
        await page.evaluate(`(() => { const input = document.querySelector("main ${selector}"); input.focus(); input.select() })()`)
        await page.cdp("Input.insertText", { text })
      }
      await retype("#marked-from", "3")
      await retype("#marked-to", "1")
      await page.evaluate(`document.querySelector("main #marked-to").blur()`)
      check(
        "create, from GitHub: a range typed backwards marks lines 1 to 3",
        await page.waitFor(`(() => { const p = ${panelState}; return p && p.marked === "1,2,3" && p.from === "1" && p.to === "3" })()`, { timeout: 5000 }),
        JSON.stringify(await page.evaluate(panelState)),
      )
      await page.evaluate(`document.querySelector('main [data-github-file] [data-line="2"]').click()`)
      check(
        "create, from GitHub: clicking a line number marks just that line",
        await page.waitFor(`(() => { const p = ${panelState}; return p && p.marked === "2" && p.from === "2" && p.to === "2" })()`, { timeout: 5000 }),
      )
      await page.evaluate(`document.querySelector('main [data-github-file] [data-line="3"]').dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }))`)
      check(
        "create, from GitHub: shift-clicking another stretches the mark to it",
        await page.waitFor(`(() => { const p = ${panelState}; return p && p.marked === "2,3" && p.from === "2" && p.to === "3" })()`, { timeout: 5000 }),
      )

      // Browsing: a repository from the list, a folder, then Find a file.
      await page.evaluate(click(fromGitHubButton))
      check("create, from GitHub: the picker lists your repositories again", await page.waitFor(repoRow, { timeout: 20000 }))
      await page.evaluate(click(repoRow))
      check("create, from GitHub: choosing a repository shows its folders and files", await page.waitFor(entry("lib"), { timeout: 20000 }))
      await page.evaluate(click(entry("lib")))
      check("create, from GitHub: opening a folder shows what's inside", await page.waitFor(entry("lib/code-files.ts"), { timeout: 5000 }))
      const entryHeight = await page.evaluate(`${entry("lib/code-files.ts")}.getBoundingClientRect().height`)
      check(`create, from GitHub: file rows are at least ${TAP_TARGET}px tall`, entryHeight >= TAP_TARGET, `height ${entryHeight}px`)
      await page.type("[data-github-picker] input[aria-label='Find a file']", "post-kinds.ts")
      check(
        "create, from GitHub: Find a file matches anywhere in the path",
        await page.waitFor(`${entry("lib/post-kinds.ts")} && ${picker}.querySelectorAll("[data-github-entry]").length === 1`, { timeout: 5000 }),
      )
      await page.evaluate(click(entry("lib/post-kinds.ts")))
      check(
        "create, from GitHub: choosing a file adds it as another tab",
        await page.waitFor(`!${picker} && ${tabNames} === "regex.ts post-kinds.ts"`, { timeout: 20000 }),
        await page.evaluate(tabNames),
      )

      const githubCaption = `from github ${run}`
      await page.type("#caption", githubCaption)
      await page.evaluate(click(postButton))
      const githubPosted = await page.waitFor(`location.pathname === "/"`, { timeout: 20000 })
      await sleep(800)
      const posted = await page.evaluate(`(() => {
        const card = [...document.querySelectorAll("main [data-post]")].find((el) => el.textContent.includes(${JSON.stringify(githubCaption)}))
        return card && {
          tabs: [...card.querySelectorAll("[data-file-tab]")].map((tab) => tab.textContent.trim()).join(" "),
          label: card.querySelector("[data-github-label]")?.textContent ?? null,
          marked: [...card.querySelectorAll("[data-line-numbers] [data-marked]")].map((n) => n.textContent).join(","),
        }
      })()`)
      check(
        "create, from GitHub: the post appears in the feed with where it's from and its marked lines",
        githubPosted && posted?.tabs === "regex.ts post-kinds.ts" && posted.label === `${GITHUB_FIXTURE.owner}/${GITHUB_FIXTURE.repo} · lib/regex.ts` && posted.marked === "2,3",
        JSON.stringify(posted),
      )

      // Back from GitHub: the Code tab's post is put back as it was.
      const kept = { caption: `kept ${run}`, files: [{ name: "kept.js", language: "javascript", code: "let kept = true" }] }
      await page.evaluate(`sessionStorage.setItem("devgram:code-draft", ${JSON.stringify(JSON.stringify(kept))})`)
      await open(page, `/create?tab=code&github=connected&github_login=${GITHUB_FIXTURE.owner}`)
      check(
        "create, from GitHub: coming back puts the post back as it was",
        await page.waitFor(
          `document.querySelector("#caption")?.value === ${JSON.stringify(kept.caption)} && document.querySelector("main textarea#code")?.value === "let kept = true"`,
          { timeout: 5000 },
        ),
      )
      check(
        "create, from GitHub: and says GitHub is connected",
        await page.waitFor(`document.body.textContent.includes("Connected GitHub as @${GITHUB_FIXTURE.owner}")`, { timeout: 5000 }),
      )
      check("create, from GitHub: the kept post is used once", (await page.evaluate(`sessionStorage.getItem("devgram:code-draft")`)) === null)
    }
```

In the `[small phone]` section, after `await tabRowChecks(page, "small phone, create", 4)`, add:

```js
    if (githubPostId) {
      await openCodeTab(page)
      await page.evaluate(click(`[...document.querySelectorAll("main button")].find((b) => b.textContent.includes("From GitHub"))`))
      await page.waitFor(`document.querySelector("[data-github-picker]")`, { timeout: 5000 })
      await sleep(400)
      const smallPicker = await page.evaluate(`(() => {
        const el = document.querySelector("[data-github-picker]")
        return { width: el.getBoundingClientRect().width, scrollWidth: el.scrollWidth }
      })()`)
      check(
        "small phone, create: the picker fits the screen",
        smallPicker.width === SMALL_PHONE.width && smallPicker.scrollWidth <= SMALL_PHONE.width,
        JSON.stringify(smallPicker),
      )
      await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })
    }
```

In the `[desktop code editor]` section, right after the check `"desktop, create: each file posts with its own code"`, add:

```js
    if (githubPostId) {
      await openCodeTab(page)
      await page.evaluate(click(`[...document.querySelectorAll("main button")].find((b) => b.textContent.includes("From GitHub"))`))
      await page.waitFor(`document.querySelector("[data-github-picker]")`, { timeout: 5000 })
      await sleep(400)
      const desktopPicker = await page.evaluate(`(() => {
        const box = document.querySelector("[data-github-picker]").getBoundingClientRect()
        return { width: box.width, left: box.left, top: box.top }
      })()`)
      check(
        "desktop, create: the picker is a dialog in the middle of the window",
        desktopPicker.width <= 512 && desktopPicker.left > 0 && desktopPicker.top > 0,
        JSON.stringify(desktopPicker),
      )
      await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })
      check("desktop, create: Escape closes the picker", await page.waitFor(`!document.querySelector("[data-github-picker]")`, { timeout: 5000 }))
    }
```

Run `PHONE_CHECK`.
Expected: the `[from github]` checks FAIL first on "From GitHub is at least 44px tall" (height 0: there's no such button yet). The small phone and desktop picker checks fail too.

- [ ] **Step 4: Write the GitHub file panel**

Create `components/github-file-panel.tsx`:

```tsx
"use client"

import { useEffect, useState, type KeyboardEvent } from "react"
import { GitHubMark } from "@/components/github-mark"
import { HighlightedCode } from "@/components/highlighted-code"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { markFromClick, parseMarkInput, type CodeFile, type GitHubSource, type MarkedLines } from "@/lib/code-files"

interface GitHubFilePanelProps {
  file: CodeFile
  source: GitHubSource
  onMarked: (marked: MarkedLines | null) => void
}

// A GitHub file in the Code tab: where it's from, its code (read-only, so the
// post shows exactly what's on GitHub at that commit) and the lines it points
// out. Click a line number to mark it, shift-click to stretch the mark, or
// type in the Lines boxes.
export function GitHubFilePanel({ file, source, onMarked }: GitHubFilePanelProps) {
  const marked = file.marked ?? null
  const from = marked?.from
  const to = marked?.to
  const [fromText, setFromText] = useState(from ? String(from) : "")
  const [toText, setToText] = useState(to ? String(to) : "")

  // The boxes follow the mark when a click changes it.
  useEffect(() => {
    setFromText(from ? String(from) : "")
    setToText(to ? String(to) : "")
  }, [from, to])

  // The boxes take effect when you leave them or press Enter. A range they
  // can't read puts back the mark as it was.
  const commit = () => {
    const next = parseMarkInput(fromText, toText)
    if (next === undefined || (next?.from === from && next?.to === to)) {
      setFromText(from ? String(from) : "")
      setToText(to ? String(to) : "")
      return
    }
    onMarked(next)
  }
  const commitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    commit()
  }
  const label = `${source.owner}/${source.repo} · ${source.path}`

  return (
    <div data-github-file className="space-y-3">
      <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <GitHubMark className="h-4 w-4 shrink-0" />
        <span data-github-label title={label} className="min-w-0 truncate">
          {label}
        </span>
      </p>
      <p className="text-sm text-muted-foreground">Code from GitHub can&apos;t be edited.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="marked-from">Lines</Label>
          <Input
            id="marked-from"
            inputMode="numeric"
            autoComplete="off"
            value={fromText}
            onChange={(event) => setFromText(event.target.value)}
            onBlur={commit}
            onKeyDown={commitOnEnter}
            className="min-h-11 w-24 md:min-h-9"
          />
        </div>
        <span className="pb-3 text-sm text-muted-foreground md:pb-2">to</span>
        <div className="space-y-1">
          <Label htmlFor="marked-to" className="sr-only">
            Last line
          </Label>
          <Input
            id="marked-to"
            inputMode="numeric"
            autoComplete="off"
            value={toText}
            onChange={(event) => setToText(event.target.value)}
            onBlur={commit}
            onKeyDown={commitOnEnter}
            className="min-h-11 w-24 md:min-h-9"
          />
        </div>
        <Button type="button" variant="ghost" onClick={() => onMarked(null)} disabled={!marked} className="min-h-11 md:min-h-9">
          Clear
        </Button>
      </div>
      <div className="max-h-[60vh] overflow-auto rounded-md border">
        <HighlightedCode
          code={file.code}
          language={file.language}
          marked={marked}
          onLineClick={(line, shift) => onMarked(markFromClick(marked, line, shift))}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Write the picker**

Create `components/github-picker.tsx`:

```tsx
"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { ArrowLeft, File, Folder } from "lucide-react"
import { GitHubMark } from "@/components/github-mark"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/auth-context"
import type { GitHubSource, MarkedLines } from "@/lib/code-files"
import {
  FOLDER_NOT_FOUND,
  UNREACHABLE,
  entriesInFolder,
  matchFiles,
  parentFolder,
  type GitHubFileResponse,
  type GitHubRepo,
  type ResolvedLink,
  type TreeEntry,
} from "@/lib/github-links"

// A file chosen in the picker, ready to become a tab in the Code tab.
export interface PickedFile {
  name: string
  language: string
  code: string
  github: GitHubSource
  marked: MarkedLines | null
}

interface GitHubPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (file: PickedFile) => void
  // Leaves for GitHub to connect, keeping the post as it is.
  onConnect: () => void
}

// The repository being browsed: every entry at one commit, and the folder open.
interface Browsing {
  owner: string
  repo: string
  commit: string
  entries: TreeEntry[]
  folder: string
}

const row = "flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-1 text-left text-sm hover:bg-muted disabled:opacity-50 md:min-h-9"
// The whole screen on phones; a dialog in the middle of the window from 640px.
const layout =
  "top-0 left-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-4 overflow-hidden rounded-none border-0 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:top-[50%] sm:left-[50%] sm:h-[min(40rem,85vh)] sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border"

// Create's From GitHub: paste a link to any public repository, folder or
// file, or open one of your repositories and choose a file.
export function GitHubPicker({ open, onOpenChange, onPick, onConnect }: GitHubPickerProps) {
  const { user, authFetch } = useAuth()
  const connected = Boolean(user?.github)
  const [link, setLink] = useState("")
  const [repos, setRepos] = useState<GitHubRepo[] | null>(null)
  const [repoFilter, setRepoFilter] = useState("")
  const [browsing, setBrowsing] = useState<Browsing | null>(null)
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  // An answer from one of the GitHub routes; throws the server's message.
  const getJson = useCallback(
    async <T,>(path: string): Promise<T> => {
      const response = await authFetch(path)
      const data = await response.json().catch(() => null)
      if (!response.ok || data === null) throw new Error(data?.error || UNREACHABLE)
      return data as T
    },
    [authFetch],
  )

  // Each time the picker opens: back to the start, with your repositories fresh.
  useEffect(() => {
    if (!open) return
    setBrowsing(null)
    setQuery("")
    setLink("")
    setRepoFilter("")
    setError("")
    if (!connected) return
    let cancelled = false
    setRepos(null)
    getJson<GitHubRepo[]>("/api/github/repos")
      .then((list) => {
        if (!cancelled) setRepos(list)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setRepos([])
        setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [open, connected, getJson])

  // Runs one step, with "Loading…" meanwhile and its error if it fails.
  const step = async (work: () => Promise<void>) => {
    setBusy(true)
    setError("")
    try {
      await work()
    } catch (err) {
      setError(err instanceof Error ? err.message : UNREACHABLE)
    } finally {
      setBusy(false)
    }
  }

  const browse = async (owner: string, repo: string, commit: string, folder: string) => {
    const { entries } = await getJson<{ entries: TreeEntry[] }>(`/api/github/tree?${new URLSearchParams({ owner, repo, commit })}`)
    if (folder && !entries.some((entry) => entry.type === "folder" && entry.path === folder)) throw new Error(FOLDER_NOT_FOUND)
    setBrowsing({ owner, repo, commit, entries, folder })
    setQuery("")
  }

  // Marks from a link that don't fit the file are dropped rather than refused.
  const pick = async (source: GitHubSource, marked: MarkedLines | null) => {
    const file = await getJson<GitHubFileResponse>(`/api/github/file?${new URLSearchParams({ ...source })}`)
    onPick({
      name: file.name,
      language: file.language,
      code: file.code,
      github: file.github,
      marked: marked && marked.to <= file.lineCount ? marked : null,
    })
    onOpenChange(false)
  }

  const openLink = (url: string) =>
    step(async () => {
      const found = await getJson<ResolvedLink>(`/api/github/resolve?${new URLSearchParams({ url })}`)
      if (found.kind === "file") await pick({ owner: found.owner, repo: found.repo, commit: found.commit, path: found.path }, found.marked)
      else await browse(found.owner, found.repo, found.commit, found.path)
    })

  const submitLink = (event: FormEvent) => {
    event.preventDefault()
    if (link.trim()) openLink(link.trim())
  }

  const shown = browsing ? (query.trim() ? matchFiles(browsing.entries, query) : entriesInFolder(browsing.entries, browsing.folder)) : []
  const needle = repoFilter.trim().toLowerCase()
  const listedRepos = (repos ?? []).filter((repo) => repo.name.toLowerCase().includes(needle))
  const crumbs = browsing?.folder ? browsing.folder.split("/") : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-github-picker className={layout}>
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="flex items-center gap-2">
            <GitHubMark className="h-5 w-5" />
            From GitHub
          </DialogTitle>
          <DialogDescription>Public repositories only. A file is shared as it is at its commit.</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {browsing ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Back"
                className="size-11 shrink-0 md:size-9"
                onClick={() => (browsing.folder ? setBrowsing({ ...browsing, folder: parentFolder(browsing.folder) }) : setBrowsing(null))}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <nav
                aria-label="Path"
                className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <button type="button" className="min-h-11 shrink-0 font-medium hover:underline md:min-h-9" onClick={() => setBrowsing({ ...browsing, folder: "" })}>
                  {browsing.repo}
                </button>
                {crumbs.map((part, index) => (
                  <span key={index} className="flex shrink-0 items-center gap-1">
                    <span className="text-muted-foreground">/</span>
                    <button
                      type="button"
                      className="min-h-11 hover:underline md:min-h-9"
                      onClick={() => setBrowsing({ ...browsing, folder: crumbs.slice(0, index + 1).join("/") })}
                    >
                      {part}
                    </button>
                  </span>
                ))}
              </nav>
            </div>
            <Input
              aria-label="Find a file"
              placeholder="Find a file"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="min-h-11 md:min-h-9"
            />
            <ul data-github-entries className="min-h-0 flex-1 overflow-y-auto">
              {shown.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    data-github-entry={entry.path}
                    disabled={busy}
                    className={row}
                    onClick={() =>
                      entry.type === "folder"
                        ? setBrowsing({ ...browsing, folder: entry.path })
                        : step(() => pick({ owner: browsing.owner, repo: browsing.repo, commit: browsing.commit, path: entry.path }, null))
                    }
                  >
                    {entry.type === "folder" ? (
                      <Folder className="h-4 w-4 shrink-0 text-sky-500" />
                    ) : (
                      <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{query.trim() ? entry.path : entry.path.slice(entry.path.lastIndexOf("/") + 1)}</span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">{query.trim() ? "No matching files" : "This folder is empty"}</li>
              )}
            </ul>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <form onSubmit={submitLink} className="flex gap-2">
              <Input
                data-github-link-input
                aria-label="Paste a GitHub link"
                placeholder="Paste a GitHub link"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="min-h-11 md:min-h-9"
              />
              <Button type="submit" disabled={busy || !link.trim()} className="min-h-11 shrink-0 md:min-h-9">
                Open
              </Button>
            </form>
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <p className="text-sm font-medium">Your repositories</p>
              {!connected ? (
                <Button type="button" variant="outline" onClick={onConnect} className="min-h-11 md:min-h-9">
                  <GitHubMark className="h-4 w-4" />
                  Connect GitHub
                </Button>
              ) : repos === null ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <>
                  <Input
                    aria-label="Filter your repositories"
                    placeholder="Filter your repositories"
                    value={repoFilter}
                    onChange={(event) => setRepoFilter(event.target.value)}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="min-h-11 md:min-h-9"
                  />
                  <ul className="min-h-0 flex-1 overflow-y-auto">
                    {listedRepos.map((repo) => (
                      <li key={`${repo.owner}/${repo.name}`}>
                        <button
                          type="button"
                          data-github-repo={repo.name}
                          disabled={busy}
                          className={row}
                          onClick={() => openLink(`https://github.com/${repo.owner}/${repo.name}`)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{repo.name}</span>
                            {repo.description && <span className="block truncate text-xs text-muted-foreground">{repo.description}</span>}
                          </span>
                          {repo.language && <span className="shrink-0 text-xs text-muted-foreground">{repo.language}</span>}
                        </button>
                      </li>
                    ))}
                    {listedRepos.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No repositories</li>}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
        {busy && <p className="text-sm text-muted-foreground">Loading…</p>}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 6: Put both in the Code tab**

Replace `components/code-files-editor.tsx` with:

```tsx
"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { GitHubFilePanel } from "@/components/github-file-panel"
import { GitHubMark } from "@/components/github-mark"
import { GitHubPicker, type PickedFile } from "@/components/github-picker"
import { HighlightedCode } from "@/components/highlighted-code"
import type { MonacoInputProps } from "@/components/monaco-input"
import { LANGUAGES, MAX_FILES, MAX_FILE_NAME, guessLanguage, languageLabel, type CodeFile } from "@/lib/code-files"
import { cn } from "@/lib/utils"

// A file being written, or one taken from GitHub. Its key stays the same
// through renames.
export interface DraftFile extends CodeFile {
  key: number
}

let lastKey = 0
// A new draft file. `fields` fills it in (a file from GitHub, or one kept
// while connecting GitHub); its key is always a new one.
export function newDraftFile(language = "javascript", fields: Partial<CodeFile> = {}): DraftFile {
  lastKey += 1
  return { name: "", language, code: "", ...fields, key: lastKey }
}

export const EDITOR_FAILED = "The full editor couldn't load — you can still write here."
// A mouse or trackpad, and a screen at least 768px wide: Monaco doesn't work
// in phone browsers.
const COMPUTER = "(pointer: fine) and (min-width: 768px)"

const editorLoading = (
  <div className="flex h-80 items-center justify-center rounded-md border bg-zinc-950 text-sm text-zinc-400">Loading editor…</div>
)

// Monaco's code, and Monaco itself from jsDelivr, load only when a computer
// opens the Code tab. If that code can't load (a deploy replaced it, say), the
// plain box takes over instead of the page breaking.
const MonacoInput = dynamic<MonacoInputProps>(
  () =>
    import("@/components/monaco-input").catch(() => ({
      default: function MonacoMissing({ onFail }: MonacoInputProps) {
        useEffect(() => onFail(), [onFail])
        return null
      },
    })),
  { ssr: false, loading: () => editorLoading },
)

// The plain code box: what phones get. Nothing in it second-guesses what
// you type, and a highlighted copy of the code shows under it.
function PlainCodeBox({ file, onCode, note }: { file: CodeFile; onCode: (code: string) => void; note?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="code">Code</Label>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      <Textarea
        id="code"
        placeholder="Paste or write your code here..."
        className="max-h-[60vh] min-h-[200px] font-mono"
        value={file.code}
        onChange={(event) => onCode(event.target.value)}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
      />
      {file.code && (
        <div data-code-preview className="max-h-80 overflow-auto rounded-md border">
          <HighlightedCode code={file.code} language={file.language} />
        </div>
      )}
    </div>
  )
}

interface CodeFilesEditorProps {
  files: DraftFile[]
  onChange: (files: DraftFile[]) => void
  // Leaves for GitHub to connect, keeping the post as it is.
  onConnectGitHub: () => void
}

// Create's Code tab: up to 5 files as tabs. Each is written here (a name, a
// language guessed from the name or picked, and its code) or taken from
// GitHub (read-only, with marked lines).
export function CodeFilesEditor({ files, onChange, onConnectGitHub }: CodeFilesEditorProps) {
  const [active, setActive] = useState(0)
  const [picking, setPicking] = useState(false)
  const current = Math.min(active, files.length - 1)
  const file = files[current]
  const computer = useMediaQuery(COMPUTER)
  const [monacoFailed, setMonacoFailed] = useState(false)
  const onMonacoFail = useCallback(() => setMonacoFailed(true), [])
  const full = files.length >= MAX_FILES

  const update = (changes: Partial<CodeFile>) =>
    onChange(files.map((item, index) => (index === current ? { ...item, ...changes } : item)))
  const rename = (name: string) => {
    const guessed = guessLanguage(name)
    update(guessed ? { name, language: guessed } : { name })
  }
  const add = () => {
    onChange([...files, newDraftFile(file.language)])
    setActive(files.length)
  }
  // A file from GitHub takes the place of a single empty, unnamed file.
  const addFromGitHub = (picked: PickedFile) => {
    const draft = newDraftFile(picked.language, {
      name: picked.name,
      code: picked.code,
      github: picked.github,
      ...(picked.marked ? { marked: picked.marked } : {}),
    })
    const empty = files.length === 1 && !files[0].name && !files[0].code && !files[0].github
    onChange(empty ? [draft] : [...files, draft])
    setActive(empty ? 0 : files.length)
  }
  // Removing the only file leaves an empty one to write in.
  const remove = () => {
    onChange(files.length > 1 ? files.filter((_, index) => index !== current) : [newDraftFile()])
    setActive(Math.max(0, current - 1))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Files"
          className="flex w-full min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] sm:w-auto sm:flex-1 [&::-webkit-scrollbar]:hidden"
        >
          {files.map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={index === current}
              data-file-tab
              onClick={() => setActive(index)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-sm md:min-h-9",
                index === current
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-muted-foreground hover:text-foreground",
              )}
            >
              {item.github && <GitHubMark className="h-3.5 w-3.5 shrink-0" />}
              {item.name || (files.length > 1 ? "Untitled" : languageLabel(item.language))}
            </button>
          ))}
        </div>
        <Button type="button" variant="outline" onClick={add} disabled={full} className="min-h-11 shrink-0 md:min-h-9">
          <Plus className="h-4 w-4" />
          Add file
        </Button>
        <Button type="button" variant="outline" onClick={() => setPicking(true)} disabled={full} className="min-h-11 shrink-0 md:min-h-9">
          <GitHubMark className="h-4 w-4" />
          From GitHub
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="file-name">File name</Label>
          <Input
            id="file-name"
            value={file.name}
            maxLength={MAX_FILE_NAME}
            placeholder={files.length > 1 ? "app.js" : "Optional, like app.js"}
            onChange={(event) => rename(event.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="file-language">Language</Label>
          <Select value={file.language} onValueChange={(language) => update({ language })}>
            <SelectTrigger id="file-language" className="min-h-11 w-full md:min-h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((language) => (
                <SelectItem key={language.id} value={language.id}>
                  {language.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {file.github ? (
        <GitHubFilePanel file={file} source={file.github} onMarked={(marked) => update({ marked: marked ?? undefined })} />
      ) : computer && !monacoFailed ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Code</p>
          <MonacoInput
            path={`file-${file.key}`}
            language={file.language}
            value={file.code}
            onChange={(code) => update({ code })}
            onFail={onMonacoFail}
            loading={editorLoading}
          />
        </div>
      ) : (
        <PlainCodeBox file={file} onCode={(code) => update({ code })} note={monacoFailed ? EDITOR_FAILED : undefined} />
      )}
      {(files.length > 1 || file.github) && (
        <Button type="button" variant="ghost" onClick={remove} className="min-h-11 text-destructive md:min-h-9">
          <Trash2 className="h-4 w-4" />
          Remove {file.name || "this file"}
        </Button>
      )}
      <GitHubPicker open={picking} onOpenChange={setPicking} onPick={addFromGitHub} onConnect={onConnectGitHub} />
    </div>
  )
}
```

In `components/create-post-form.tsx`:
- Add these imports:

```tsx
import { useGitHubReturn } from "@/hooks/use-github-return"
import { saveDraft, takeDraft } from "@/lib/code-draft"
import { connectHref } from "@/lib/github-links"
```

- Right after `const [files, setFiles] = useState<DraftFile[]>(() => [newDraftFile()])`, add:

```tsx
  useGitHubReturn()
  // Back from connecting GitHub: the Code tab's post comes back as it was.
  useEffect(() => {
    if (initialTab !== "code") return
    const draft = takeDraft()
    if (!draft) return
    setCaption(draft.caption)
    setFiles(draft.files.map((file) => newDraftFile(file.language, file)))
  }, [initialTab])
  const connectGitHub = () => {
    saveDraft({ caption, files: files.map(({ name, language, code, github, marked }) => ({ name, language, code, github, marked })) })
    window.location.assign(connectHref("/create?tab=code"))
  }
```

- In `handleSubmit`, replace the last three lines (from `const parsed = parseFiles(` to `return publish({ caption, files: parsed.files })`) with:

```tsx
    const parsed = parseFiles(files.map(({ name, language, code, github, marked }) => ({ name, language, code, github, marked })))
    if ("error" in parsed) return setError(parsed.error)
    // GitHub files go without their code: the server fetches it from GitHub.
    return publish({ caption, files: parsed.files.map(({ code, ...file }) => (file.github ? file : { ...file, code })) })
```

- Change `<CodeFilesEditor files={files} onChange={setFiles} />` to:

```tsx
                <CodeFilesEditor files={files} onChange={setFiles} onConnectGitHub={connectGitHub} />
```

- [ ] **Step 7: Run everything to see it pass**

Run `PHONE_CHECK`.
Expected: every check passes, including `[from github]`, the small phone and desktop picker checks, and all the earlier Code tab checks: tabs, Add file, Remove, Monaco and the plain box.

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add lib/code-draft.ts scripts/unit/code-draft.test.mjs components/github-file-panel.tsx components/github-picker.tsx components/code-files-editor.tsx components/create-post-form.tsx scripts/mobile-check.mjs
git commit -q -F - <<'EOF'
Pick files from GitHub in Create and mark the lines that matter

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

---

### Task 10: README, every check, connecting by hand, shipping

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the documented feature, a full green run, one real connect on localhost, and (with the user's go-ahead) the feature live.

- [ ] **Step 1: Document GitHub connect**

Make these replacements in `README.md`:

1. In Features, replace
   `- Code posts with up to 5 files in 26 languages: line numbers, Copy, and Run for HTML and JavaScript in a locked-down sandbox; written in Monaco (VS Code's editor) on computers`
   with
   ```markdown
   - Code posts with up to 5 files in 27 languages: line numbers, Copy, and Run for HTML and JavaScript in a locked-down sandbox; written in Monaco (VS Code's editor) on computers
   - Files from GitHub in code posts: connect your GitHub account to pick from your public repositories, or paste a link to any public file; mark the lines that matter, and the post opens on them, linked to the exact commit
   ```
2. Replace `- User profiles with avatar, bio and website` with `- User profiles with avatar, bio, website and a connected GitHub account`.
3. In Tech stack, after ``- Prism for code highlighting; Monaco (`@monaco-editor/react`) for writing code on computers``, add `- GitHub's REST API through an OAuth app; Devgram keeps no GitHub tokens`.
4. In the `.env.local` example, after `MUX_TEST_UPLOADS=1`, add:
   ```bash
   GITHUB_CLIENT_ID=from_your_github_oauth_app
   GITHUB_CLIENT_SECRET=from_your_github_oauth_app
   ```
5. In the Scripts table, replace the `npm run test:unit` row's description with `unit tests for the upload rules, code posts (file rules, highlighting, Run), GitHub (links, the client, the connect cookie, a kept post) and photo and video deletes`.
6. After the paragraph that starts `The smoke test's photos, videos and devbits sections`, add:
   ```markdown
   The GitHub sections of both scripts read the public repository `tmonga2208/devgram` at a fixed commit through the app's GitHub keys in `.env.local`, and skip themselves when those keys are missing.
   ```
7. In Code posts, replace ``in one of the 26 languages listed in `lib/code-files.ts` `` with ``in one of the 27 languages listed in `lib/code-files.ts` (the 27th, Plain text, has no colours)``.
8. Add this section right before `## Folder structure`:
   ```markdown
   ## GitHub

   People connect a GitHub account in Settings → Account; it then shows on their profile and fills "Your repositories" in Create's From GitHub picker. Anyone can also paste a link to a public repository, folder or file, with `#L83-L85` to mark lines.

   - **Connecting** asks GitHub for no permissions. Devgram reads the account's number and username once, then deletes its authorization on GitHub, so it holds no token. People stay connected until they press Disconnect; GitHub shows its approval page again only when they connect again.
   - **Reading GitHub:** repositories, folders and files are read on the server with the OAuth app's client ID and secret, which GitHub allows 5,000 requests an hour for the whole site. Only public repositories can be read.
   - **Posting:** a file from GitHub is stored with its repository, full commit and path, and the server fetches its code from GitHub at that commit, so the post shows exactly what GitHub has and doesn't change when the repository does. Files from GitHub can be up to 100,000 characters, and a post's files up to 100,000 together.

   Setup for a new deployment:

   1. GitHub → Settings → Developer settings → OAuth apps → New OAuth App. Homepage: your site. Callback URLs: `https://<your site>/api/github/callback`, plus `http://localhost:3000/api/github/callback` and any other local port you use. Then generate a client secret.
   2. Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to the Vercel project for Production, Preview and Development, and to `.env.local`.

   Preview deployments can't connect, since their addresses aren't registered callbacks, but they can browse GitHub and post files from it.
   ```
9. In the API overview, after the `GET    /api/uploads/video/:id` line, add a blank line and:
   ```
   GET    /api/github/connect           Start connecting GitHub (a link; ?return= a page)
   DELETE /api/github/connect        🔒 Disconnect GitHub
   GET    /api/github/callback          Where GitHub sends people back
   GET    /api/github/repos          🔒 Your public repositories
   GET    /api/github/resolve?url=   🔒 A GitHub link as owner, repository, commit and path
   GET    /api/github/tree           🔒 A repository's folders and files at a commit
   GET    /api/github/file           🔒 One file's text at a commit
   ```
10. In Not yet built, replace `- Skills and GitHub link on profiles` with `- Skills on profiles`.

- [ ] **Step 2: Run every check**

With the dev server running on port 3210, restarted after the last model change:

```bash
npm run test:unit && npm run typecheck && npm run lint && npm run build
env SMOKE_BASE_URL=http://localhost:3210 npm run smoke
env SMOKE_BASE_URL=http://localhost:3210 npm run mobile-check
```

Expected:
- Unit tests, typecheck, lint and build all pass.
- The smoke test reports `0 failed` across every section, and its cleanup removes both test users.
- The full phone check (this is its one run with uploads) reports `0 failed`, and cleanup removes the test users, their uploads and their videos.

`npm run build` writes `.next`, so restart the dev server afterwards if you still need it.

- [ ] **Step 3: Connect by hand on localhost (the user)**

GitHub's sign-in page can't be automated. Ask the user to do this in their own browser, signed in to their local Devgram account at http://localhost:3210:

1. Settings → Account → **Connect GitHub**. GitHub asks only for public profile access → **Authorize**.
2. Back on Settings, the page shows "Connected GitHub as @<their login>" and "Connected as @<their login>".
3. Their profile shows the GitHub link.
4. Create → Code → **From GitHub**: their repositories are listed. Choosing a file adds it.
5. On https://github.com/settings/applications (Authorized OAuth Apps), Devgram is **not** listed: its authorization was deleted after connecting.
6. Settings → Account → **Disconnect**: the profile link goes away.

Fix anything that doesn't behave like this before going on. Each fix gets its own test where a test can catch it, then re-run Step 2.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -q -F - <<'EOF'
Document GitHub connect

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU
EOF
```

- [ ] **Step 5: Ship, with the user's go-ahead**

Use superpowers:finishing-a-development-branch. Merging `github-connect` into `master` and pushing deploys production, so ask the user first. Before pushing, check that the variables exist on Vercel without printing their values:

```bash
vercel env ls | grep -E 'GITHUB_CLIENT_(ID|SECRET)'   # each listed for Production, Preview and Development
```

After the push:
- `vercel inspect devgram-nine.vercel.app` should show the new deployment serving the domain.
- Ask the user to connect once on https://devgram-nine.vercel.app (Step 3's list, on the live site). Don't run the smoke test or the phone check against production without asking.

---

