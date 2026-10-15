# Code Posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade code posts. A post can hold up to 5 files in 26 languages. One code view (tabs, Copy, line numbers, folding) shows them everywhere. Run executes HTML and JavaScript in a locked-down sandbox. Monaco is the editor on computers; phones get a plain box with a live preview.

**Architecture:** A code post stores `files: [{ name, language, code }]`. Posts from before keep `code` and `language`, and `postFiles` reads them as one unnamed file. Two modules hold the logic and import nothing at run time:

- `lib/code-files.ts`: the file rules and the languages.
- `lib/code-run.ts`: which posts can run, the document the run frame loads, and checks on everything the frame sends back.

`lib/code-highlight.ts` turns Prism's tokens into plain data that the views render as elements. `CodeView` shows a post's files. `CodeRun` loads the code into an iframe whose sandbox is exactly `allow-scripts`. A JavaScript-only post runs in a worker inside that frame, and the view removes the frame after 5 seconds. Create's Code tab edits the files: Monaco (from jsDelivr, pinned) on computers, a plain box with a highlighted preview on phones.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), Mongoose 8, Prism 1.30 (`prismjs`, already installed), and `@monaco-editor/react` 4.7.0 with Monaco 0.55.1 from jsDelivr. Tests: `node:test` (`npm run test:unit`), `scripts/smoke.mjs` (API), `scripts/mobile-check.mjs` (headless Chrome over CDP).

**Spec:** `docs/superpowers/specs/2026-10-14-code-posts-design.md`

## Global Constraints

- **Files:**
  - 1–5 per post (`MAX_FILES = 5`).
  - Each file's code is 1–20,000 characters (`MAX_FILE_CHARS = 20000`), is not only whitespace, and is kept exactly as written.
  - Names are trimmed, at most 100 characters (`MAX_FILE_NAME = 100`), contain no `/` or `\`, and are unique within the post. A name may be empty only when the post has one file.
- **Storage:**
  - New code posts store `files` (subdocuments without `_id`) and `language` (the first file's language). They store no `code`.
  - Older posts keep `code`/`language` and are never migrated. They read as one file with no name, in `javascript` when they had no language.
  - `POST /api/posts` still accepts `code` with an optional `language` and stores it as one unnamed file.
- **Languages:** the 26 listed in Task 1, each with an id, label, Prism name and Monaco name. HTML is `markup` in Prism, Bash is `shell` in Monaco, and Dockerfile is `docker` in Prism. The old ids `javascript`, `typescript`, `jsx`, `html`, `css`, `python`, `java` and `csharp` keep their meaning.
- **Spec copy, verbatim:** "A post can have up to 5 files", "Give each file a name", "Two files can't have the same name", "Each file can be up to 20,000 characters", "A file can't be empty", "Stopped after 5 seconds", "Couldn't copy — select the code instead", "The full editor couldn't load — you can still write here.", "Copied ✓".
- **Copy this plan adds** (the spec has no wording for these cases):
  - "Choose a language from the list".
  - "File names can be up to 100 characters, without / or \".
  - API only: "Files must be a list of { name, language, code }" and "Send either files or code, not both".
  - "This browser can't run JavaScript here".
  - "Running…", "No output", "Loading editor…".
  - Labels: "Copy", "Run", "Stop", "Show all", "Add file", "Remove <name>", "File name", "Language", "Untitled".
- **Run:**
  - Never starts by itself. The frame's `sandbox` attribute is exactly `allow-scripts`.
  - **A page** is the first HTML file. The bridge script comes first (after the page's doctype). CSS files go in as `<style>` elements before the page and JavaScript files as `<script>` elements after it, in file order.
  - **JavaScript-only posts** run in a worker inside the frame, each file as its own script. The view removes the frame 5 seconds after Run (`RUN_SECONDS`). It says "Stopped after 5 seconds" only if the code hadn't finished by then.
  - **Output panel:** keeps the newest 200 lines (`MAX_RUN_LINES`), each cut at 1,000 characters (`MAX_LINE_CHARS`). `alert()` prints to the panel.
  - **Page preview:** a fixed 288px (`h-72`) frame that scrolls.
- **Highlighting:**
  - Prism tokens are rendered as React elements, never as HTML strings.
  - No element gets a `language-*` class, because Prism's automatic highlighter would rewrite it.
  - Token colours come from `prismjs/themes/prism-tomorrow.css`.
- **Folding:** the feed folds a file longer than 20 lines (`FEED_LINES`) behind "Show all". The post page shows every line.
- **Tap targets:** on phones, file tabs, Copy, Run, Show all, Add file, Remove and the language picker are at least 44px tall (`min-h-11 md:min-h-9`).
- **Monaco:**
  - `@monaco-editor/react` at exactly `4.7.0`.
  - Monaco's own files load from `https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs`.
  - `monaco-editor` at exactly `0.55.1` as a devDependency. It is used for types only, and it satisfies the wrapper's peer dependency, which would otherwise install the newest version.
  - Used only when `(pointer: fine) and (min-width: 768px)` matches. If Monaco fails or hasn't shown within 10 seconds, the plain box appears with "The full editor couldn't load — you can still write here."
- **Safety:** never print `.env.local` or any secret, and run nothing against production. The dev server runs on port 3210; port 3000 belongs to another project and must never be stopped.
- **Dev server after model changes:** Mongoose caches schemas, so restart the dev server after any change under `models/`.
- **Uploads during phone checks:**
  - Tasks 3–6 run the phone check with `MUX_TOKEN_ID=` and `BLOB_READ_WRITE_TOKEN=` set empty, so it skips the photo and video uploads. A variable set in the environment beats `--env-file`.
  - The full run with uploads happens once, at the end of Task 6. Mux's Free plan stores at most 10 videos, shared with the live site.
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

- `npm run test:unit`
- `env SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- <sections>`
- The phone check without uploads, which is what `PHONE_CHECK` means below:
  `env SMOKE_BASE_URL=http://localhost:3210 MUX_TOKEN_ID= BLOB_READ_WRITE_TOKEN= npm run mobile-check`
- The full phone check, in Task 6: `env SMOKE_BASE_URL=http://localhost:3210 npm run mobile-check`

## Review Focus

1. **Endless logging.** Code that logs in an endless loop (`while (true) console.log(i++)`): the page keeps responding, the panel holds at most 200 lines, and the run stops after 5 seconds.
   Pinned in Task 4: a unit test ("the worker sends at most 200 waiting lines") and the phone check "endless logging".
2. **End tags inside code.** Code containing `</script>` or `</style>`, for example inside a string: Run still runs it as written, and nothing escapes its element.
   Pinned in Task 4 (unit).
3. **Shared names across files.** Several JavaScript files that share top-level `const` declarations, one of which throws: later files still see the earlier names and still run, as separate script tags would.
   Pinned in Task 4: a unit test and the phone check "script post".
4. **Switching or removing files while writing.** Every file keeps its own code. This holds in the plain box and in Monaco, which keeps one model per file.
   Pinned in Task 5 (phone) and Task 6 (desktop).
5. **Narrow phones.** A 320px phone showing a post with three file tabs, or with a 300-character line: the page doesn't scroll sideways; the tabs and the code scroll inside the view.
   Pinned in Task 3 (phone check, small phone).

## File Structure

Create:

| File | Responsibility |
| --- | --- |
| `lib/code-files.ts` | The file rules, the 26 languages, guessing a language from a file name, reading any post as files, counting a file's lines. No imports. |
| `scripts/unit/code-files.test.mjs` | Unit tests for it. |
| `lib/code-highlight.ts` | Prism with a grammar for every language; turns code into highlighted pieces of plain data. |
| `scripts/unit/code-highlight.test.mjs` | Unit tests for it. |
| `components/highlighted-code.tsx` | Line numbers and highlighted code; long lines scroll sideways. |
| `components/code-view.tsx` | A post's files: tabs (or the one file's name or language), Copy, Run, folding in the feed. |
| `lib/code-run.ts` | Which posts run, the document a run frame loads (bridge, worker), reading frame messages, the 200-line panel. No run-time imports. |
| `scripts/unit/code-run.test.mjs` | Unit tests for it. Node's `vm` module stands in for the worker and the frame. |
| `components/code-run.tsx` | One run: the sandboxed frame, the 5-second stop, the output panel. |
| `components/code-files-editor.tsx` | Create's Code tab: file tabs, file name, language, and Monaco or the plain box with its preview. |
| `components/monaco-input.tsx` | Monaco from jsDelivr with the 10-second fallback; loaded only when used. |
| `hooks/use-media-query.ts` | Whether a CSS media query matches (false on the server). |

Modify: `models/Post.ts`, `lib/types.ts`, `lib/http.ts`, `app/api/posts/route.ts`, `contexts/posts-context.tsx`, `components/post.tsx`, `components/post-detail.tsx`, `components/create-post-form.tsx`, `scripts/lib/test-users.mjs`, `scripts/smoke.mjs`, `scripts/mobile-check.mjs`, `package.json`, `package-lock.json`, `README.md`.

Delete: `components/code-block.tsx`.

---

### Task 1: Code file rules

**Files:**
- Create: `lib/code-files.ts`, `scripts/unit/code-files.test.mjs`

**Interfaces:**
- Produces (`lib/code-files.ts`):
  - **Types:** `interface CodeFile { name: string; language: string; code: string }` and `interface Language { id; label; prism; monaco; extensions: string[] }`.
  - **Limits:** `MAX_FILES = 5`, `MAX_FILE_CHARS = 20000`, `MAX_FILE_NAME = 100`, `FEED_LINES = 20`.
  - **Messages:** `TOO_MANY_FILES`, `NAME_NEEDED`, `SAME_NAME`, `FILE_TOO_LONG`, `EMPTY_FILE`, `BAD_NAME`, `UNKNOWN_LANGUAGE`, `BAD_FILES`.
  - **`LANGUAGES: Language[]`:** the 26, in the spec's order.
  - **Functions:**
    - `languageById(id: string): Language | undefined`
    - `languageLabel(id: string): string`
    - `guessLanguage(name: string): string | null`
    - `parseFiles(value: unknown): { files: CodeFile[] } | { error: string }`
    - `postFiles(post: { files?: CodeFile[]; code?: string; language?: string }): CodeFile[]`
    - `displayLines(code: string): string[]`

- [ ] **Step 1: Write the failing test**

`scripts/unit/code-files.test.mjs`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  BAD_FILES,
  BAD_NAME,
  EMPTY_FILE,
  FILE_TOO_LONG,
  LANGUAGES,
  NAME_NEEDED,
  SAME_NAME,
  TOO_MANY_FILES,
  UNKNOWN_LANGUAGE,
  displayLines,
  guessLanguage,
  languageLabel,
  parseFiles,
  postFiles,
} from "../../lib/code-files.ts"

const file = (name, language, code) => ({ name, language, code })

test("has the 26 languages, each with a Prism and a Monaco name", () => {
  assert.deepEqual(
    LANGUAGES.map((language) => language.label),
    ["JavaScript", "TypeScript", "JSX", "TSX", "HTML", "CSS", "SCSS", "JSON", "Python", "Java", "C#", "C", "C++", "Go",
      "Rust", "PHP", "Ruby", "Kotlin", "Swift", "Dart", "SQL", "Bash", "YAML", "Markdown", "Dockerfile", "GraphQL"],
  )
  for (const language of LANGUAGES) assert.ok(language.prism && language.monaco, language.id)
  assert.equal(new Set(LANGUAGES.map((language) => language.id)).size, 26)
})

test("keeps the ids the old form stored", () => {
  for (const id of ["javascript", "typescript", "jsx", "html", "css", "python", "java", "csharp"]) {
    assert.ok(LANGUAGES.some((language) => language.id === id), id)
  }
  assert.equal(LANGUAGES.find((language) => language.id === "html").prism, "markup")
  assert.equal(LANGUAGES.find((language) => language.id === "bash").monaco, "shell")
})

test("guesses the language from the file name", () => {
  const cases = {
    "app.ts": "typescript", "App.TSX": "tsx", "index.html": "html", "main.py": "python", "lib.rs": "rust",
    "Dockerfile": "dockerfile", "Dockerfile.dev": "dockerfile", "schema.gql": "graphql", "run.sh": "bash",
    "config.yml": "yaml", "README.md": "markdown", "util.h": "c", "  spaced.go  ": "go",
  }
  for (const [name, id] of Object.entries(cases)) assert.equal(guessLanguage(name), id, name)
  for (const name of ["", "notes", "notes.txt", "archive.", "Makefile"]) assert.equal(guessLanguage(name), null, name)
})

test("names a language by its label, or as stored when the list doesn't have it", () => {
  assert.equal(languageLabel("csharp"), "C#")
  assert.equal(languageLabel("cobol"), "cobol")
})

test("accepts one unnamed file and several named ones, trimming names and keeping code as written", () => {
  assert.deepEqual(parseFiles([file("", "go", "package main\n")]), { files: [file("", "go", "package main\n")] })
  assert.deepEqual(parseFiles([{ language: "go", code: "x" }]), { files: [file("", "go", "x")] })
  const several = [file(" index.html ", "html", "<h1>Hi</h1>"), file("style.css", "css", "  h1 {}  ")]
  assert.deepEqual(parseFiles(several), { files: [file("index.html", "html", "<h1>Hi</h1>"), file("style.css", "css", "  h1 {}  ")] })
  const five = Array.from({ length: 5 }, (_, i) => file(`f${i}.js`, "javascript", "x"))
  assert.equal(parseFiles(five).files.length, 5)
  assert.ok("files" in parseFiles([file("a.js", "javascript", "x".repeat(20000))]))
  assert.ok("files" in parseFiles([file(`${"n".repeat(97)}.js`, "javascript", "x")]))
})

test("refuses broken files with a message a person can act on", () => {
  const cases = [
    [Array.from({ length: 6 }, (_, i) => file(`f${i}.js`, "javascript", "x")), TOO_MANY_FILES],
    [[file("a.js", "javascript", "x"), file("", "javascript", "y")], NAME_NEEDED],
    [[file("a.js", "javascript", "x"), file(" a.js", "javascript", "y")], SAME_NAME],
    [[file("a.js", "javascript", "x".repeat(20001))], FILE_TOO_LONG],
    [[file("a.js", "javascript", " \n\t ")], EMPTY_FILE],
    [[file("a.js", "javascript", "")], EMPTY_FILE],
    [[file("src/a.js", "javascript", "x")], BAD_NAME],
    [[file("src\\a.js", "javascript", "x")], BAD_NAME],
    [[file(`${"n".repeat(98)}.js`, "javascript", "x")], BAD_NAME],
    [[file("a.cob", "cobol", "x")], UNKNOWN_LANGUAGE],
    [[file("a.js", "", "x")], UNKNOWN_LANGUAGE],
  ]
  for (const [files, message] of cases) assert.deepEqual(parseFiles(files), { error: message }, message)
})

test("refuses anything that isn't a list of files", () => {
  for (const value of [undefined, null, "a.js", {}, [], [null], ["x"], [{ name: 1, language: "go", code: "x" }], [{ name: "a", code: "x" }], [{ name: "a", language: "go", code: 5 }]]) {
    assert.deepEqual(parseFiles(value), { error: BAD_FILES }, JSON.stringify(value))
  }
})

test("reads a post's files, and an old post's code as one unnamed file", () => {
  const files = [file("a.py", "python", "print(1)")]
  assert.deepEqual(postFiles({ files }), files)
  assert.deepEqual(postFiles({ code: "puts 1", language: "ruby" }), [file("", "ruby", "puts 1")])
  assert.deepEqual(postFiles({ code: "let a = 1" }), [file("", "javascript", "let a = 1")])
  assert.deepEqual(postFiles({ code: "SELECT 1", language: "plsql" }), [file("", "plsql", "SELECT 1")])
  assert.deepEqual(postFiles({ files: [], code: "x", language: "go" }), [file("", "go", "x")])
  assert.deepEqual(postFiles({ image: "https://example.com/a.png" }), [])
})

test("counts the lines a file shows", () => {
  assert.deepEqual(displayLines("a\nb"), ["a", "b"])
  assert.deepEqual(displayLines("a\r\nb\r\n"), ["a", "b"])
  assert.deepEqual(displayLines("a\rb"), ["a", "b"])
  assert.deepEqual(displayLines("a\n\n"), ["a", ""])
  assert.deepEqual(displayLines(""), [""])
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test:unit`
Expected: `fail 1`. `code-files.test.mjs` can't load `../../lib/code-files.ts` (`ERR_MODULE_NOT_FOUND`), and the other 19 tests pass.

- [ ] **Step 3: Write the rules**

`lib/code-files.ts`:

```ts
// Rules for the files in a code post, shared by the API and the browser. It
// imports nothing, so the unit tests load it in Node.

export interface CodeFile {
  name: string
  language: string
  code: string
}

export const MAX_FILES = 5
export const MAX_FILE_CHARS = 20000
export const MAX_FILE_NAME = 100
// The feed shows this many lines of a file, then "Show all".
export const FEED_LINES = 20

export const TOO_MANY_FILES = "A post can have up to 5 files"
export const NAME_NEEDED = "Give each file a name"
export const SAME_NAME = "Two files can't have the same name"
export const FILE_TOO_LONG = "Each file can be up to 20,000 characters"
export const EMPTY_FILE = "A file can't be empty"
export const BAD_NAME = "File names can be up to 100 characters, without / or \\"
export const UNKNOWN_LANGUAGE = "Choose a language from the list"
export const BAD_FILES = "Files must be a list of { name, language, code }"

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
// python, java, csharp) keep their meaning.
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

// Checks the files a code post was sent with: the files to store, or the
// first problem in words a person can act on. Names are trimmed (a missing
// one counts as empty); code is kept exactly as written.
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
    if (!code.trim()) return { error: EMPTY_FILE }
    if (code.length > MAX_FILE_CHARS) return { error: FILE_TOO_LONG }
    files.push({ name: trimmed, language, code })
  }
  if (files.length > 1 && files.some((file) => !file.name)) return { error: NAME_NEEDED }
  if (new Set(files.map((file) => file.name)).size < files.length) return { error: SAME_NAME }
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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run test:unit`
Expected: `tests 28`, `pass 28`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/code-files.ts scripts/unit/code-files.test.mjs
git commit -m "Add the rules for code post files and the 26 languages" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU"
```

---

### Task 2: Posts take files

**Files:**
- Modify: `models/Post.ts`, `lib/types.ts`, `lib/http.ts`, `app/api/posts/route.ts`, `components/post.tsx`, `components/post-detail.tsx`, `scripts/lib/test-users.mjs`, `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `parseFiles`, `postFiles` and `CodeFile` from Task 1.
- Produces:
  - `POST /api/posts` accepts `files` (or the old `code` with an optional `language`). A refusal is a 400 with `{ error: <message> }`. A post with files comes back with `files` and `language`, and without `code`.
  - `PostType.files?: CodeFile[]` and `IPost.files`.
  - `insertLegacyCodePost(username, { caption, code, language }): Promise<string>`, exported from `scripts/lib/test-users.mjs`. It returns the new post's id.

- [ ] **Step 1: Write the failing smoke tests**

In `scripts/lib/test-users.mjs`, add after `assertSameDatabase` (before `// The test users' uploaded photos live in their own folders`):

```js
// A code post stored the way the app stored one before posts had files:
// `code` and `language` on the post itself. Returns its id. Cleanup removes
// it with the rest of that user's posts.
export async function insertLegacyCodePost(username, { caption, code, language }) {
  return withDatabase(async (db) => {
    const now = new Date()
    const { insertedId } = await db.collection("posts").insertOne({
      author: { username, avatar: "/placeholder.svg" },
      caption,
      code,
      language,
      kind: "post",
      likes: 0,
      comments: [],
      likedBy: [],
      savedBy: [],
      createdAt: now,
      updatedAt: now,
    })
    return String(insertedId)
  })
}
```

In `scripts/smoke.mjs`, change the import from `./lib/test-users.mjs` to:

```js
import { assertSameDatabase, insertLegacyCodePost, removeTestUsers } from "./lib/test-users.mjs"
```

and add a `code` section after `devbits`: replace the end of the `sections` object

```js
    const gone = await api("GET", `/api/posts/${bitId}`)
    check("a deleted DevBit is gone", typeof bitId === "string" && gone.status === 404, `status ${gone.status}`)
  },
}
```

with

```js
    const gone = await api("GET", `/api/posts/${bitId}`)
    check("a deleted DevBit is gone", typeof bitId === "string" && gone.status === 404, `status ${gone.status}`)
  },
  async code() {
    await ensureUsers()
    const { a, b } = state
    const post = (token, body) => api("POST", "/api/posts", { token, body: { caption: `code ${run}`, ...body } })
    const file = (name, language, code) => ({ name, language, code })
    // Files compared by value: names, languages and code, in order.
    const same = (actual, expected) =>
      JSON.stringify(actual?.map?.((f) => [f.name, f.language, f.code])) ===
      JSON.stringify(expected.map((f) => [f.name, f.language, f.code]))

    const one = await post(a.token, { files: [file("", "go", "package main\n")] })
    check("a post with one unnamed file is 201", one.status === 201, `status ${one.status} ${one.text.slice(0, 120)}`)
    check("it comes back with its file", same(one.data?.files, [file("", "go", "package main\n")]), JSON.stringify(one.data?.files))
    check("its language is its file's, and it has no code field", one.data?.language === "go" && one.data?.code === undefined)

    const three = [
      file("index.html", "html", "<h1>Hi</h1>"),
      file("style.css", "css", "h1 { color: red }"),
      file("app.js", "javascript", "console.log(1)"),
    ]
    const several = await post(a.token, { files: three })
    check("a three-file post keeps its files in order", several.status === 201 && same(several.data?.files, three), several.text.slice(0, 160))
    check("a post's language is its first file's", several.data?.language === "html")
    const fetched = await api("GET", `/api/posts/${several.data?._id}`)
    check("reading the post back gives the same files", same(fetched.data?.files, three), fetched.text.slice(0, 160))
    const trimmed = await post(a.token, { files: [file("  main.py  ", "python", "print(1)")] })
    check("file names are trimmed", trimmed.data?.files?.[0]?.name === "main.py", JSON.stringify(trimmed.data?.files))

    const refused = [
      ["six files", { files: Array.from({ length: 6 }, (_, i) => file(`f${i}.js`, "javascript", "x")) }, "A post can have up to 5 files"],
      ["an unnamed file among several", { files: [file("a.js", "javascript", "x"), file("", "javascript", "y")] }, "Give each file a name"],
      ["two files with one name", { files: [file("a.js", "javascript", "x"), file("a.js", "javascript", "y")] }, "Two files can't have the same name"],
      ["a file over 20,000 characters", { files: [file("a.js", "javascript", "x".repeat(20001))] }, "Each file can be up to 20,000 characters"],
      ["a file of only spaces", { files: [file("a.js", "javascript", " \n ")] }, "A file can't be empty"],
      ["a name with a slash", { files: [file("src/a.js", "javascript", "x")] }, "File names can be up to 100 characters, without / or \\"],
      ["a name over 100 characters", { files: [file(`${"n".repeat(98)}.js`, "javascript", "x")] }, "File names can be up to 100 characters, without / or \\"],
      ["a language not in the list", { files: [file("a.cob", "cobol", "x")] }, "Choose a language from the list"],
      ["files that aren't a list", { files: "a.js" }, "Files must be a list of { name, language, code }"],
      ["an empty list of files", { files: [] }, "Files must be a list of { name, language, code }"],
      ["files and code together", { files: [file("a.js", "javascript", "x")], code: "y" }, "Send either files or code, not both"],
      ["the old form in a language not in the list", { code: "x", language: "cobol" }, "Choose a language from the list"],
    ]
    for (const [what, body, message] of refused) {
      const res = await post(a.token, body)
      check(`${what}: 400 "${message}"`, res.status === 400 && res.data?.error === message, `status ${res.status} ${res.text.slice(0, 120)}`)
    }

    const old = await post(a.token, { code: "fn main() {}", language: "rust" })
    check("the old code and language form still makes a post", old.status === 201, `status ${old.status}`)
    check(
      "it is stored as one file with no name",
      same(old.data?.files, [file("", "rust", "fn main() {}")]) && old.data?.language === "rust" && old.data?.code === undefined,
      old.text.slice(0, 160),
    )
    const noLanguage = await post(a.token, { code: "let a = 1" })
    check("the old form without a language is JavaScript", same(noLanguage.data?.files, [file("", "javascript", "let a = 1")]), noLanguage.text.slice(0, 160))
    const blank = await post(a.token, { code: "   " })
    check("blank code still makes a caption-only post", blank.status === 201 && blank.data?.files === undefined, blank.text.slice(0, 160))
    const photo = await post(a.token, { image: "https://example.com/a.png" })
    check("a photo post has no files", photo.status === 201 && photo.data?.files === undefined, photo.text.slice(0, 160))

    const legacyId = await insertLegacyCodePost(names.a, { caption: `stored the old way ${run}`, code: "print('old')", language: "python" })
    const legacy = await api("GET", `/api/posts/${legacyId}`)
    check(
      "a post stored before files comes back with its code and language",
      legacy.data?.code === "print('old')" && legacy.data?.language === "python" && legacy.data?.files === undefined,
      legacy.text.slice(0, 160),
    )

    // The newest Go post, by someone else, comes first among similar posts.
    const goByB = await post(b.token, { files: [file("main.go", "go", "package main")] })
    const similar = await api("GET", `/api/posts/similar/${one.data?._id}`)
    check(
      "similar posts match a post with files on its language",
      Array.isArray(similar.data) && similar.data[0]?._id === goByB.data?._id,
      `first ${similar.data?.[0]?._id}, wanted ${goByB.data?._id}`,
    )

    const devbit = await post(a.token, { kind: "devbit", videoUploadId: "x", files: [file("a.js", "javascript", "x")] })
    check(
      "a DevBit can't have files",
      devbit.status === 400 && devbit.data?.error === "A DevBit is a video and a caption only",
      devbit.text.slice(0, 120),
    )
  },
}
```

- [ ] **Step 2: Run the new section to see it fail**

Start the dev server if it isn't running (commands above), then run:
`env SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- code`

Expected:
- **Fails:** the checks that need `files`, every `400 "…"` check (today's API ignores `files`, so those requests make caption-only posts), "similar posts match a post with files on its language", and "a DevBit can't have files", which answers 404 "Video upload not found".
- **Passes:** "the old code and language form still makes a post", "blank code still makes a caption-only post", "a photo post has no files" and "a post stored before files comes back with its code and language".
- The run ends with `cleanup removed the test users` ok and a non-zero failure count.

- [ ] **Step 3: Store files on posts**

`models/Post.ts`: in `IPost`, replace

```ts
  image?: string;
  video?: string;
  code?: string;
  language?: string;
```

with

```ts
  image?: string;
  video?: string;
  // A code post's files (lib/code-files.ts). Code posts from before files
  // have `code` instead.
  files?: { name: string; language: string; code: string }[];
  code?: string;
  // A code post's language: its first file's. Similar posts match on it.
  language?: string;
```

and in `postSchema`, replace

```ts
    code: {
      type: String,
    },
```

with

```ts
    files: {
      type: [
        new mongoose.Schema(
          {
            name: { type: String, default: '' },
            language: { type: String, required: true },
            code: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      // Posts without code get no empty list.
      default: undefined,
    },
    code: {
      type: String,
    },
```

`lib/types.ts`: add at the top

```ts
import type { CodeFile } from "@/lib/code-files"

```

and in `PostType`, replace

```ts
  code?: string
  language?: string
```

with

```ts
  // A code post's files. Code posts from before files have `code` and
  // `language` instead; postFiles() reads either.
  files?: CodeFile[]
  code?: string
  language?: string
```

`lib/http.ts`: remove the two lines `  code: 20000,` and `  language: 30,` from `LIMITS` (the file rules replace them).

`app/api/posts/route.ts`:
- Add the import `import { parseFiles, type CodeFile } from '@/lib/code-files';` after the `@/lib/post-response` import.
- Replace

```ts
    const image = optionalString(body.image);
    const video = optionalString(body.video);
    // Code keeps its own whitespace, so it is not trimmed.
    const code = typeof body.code === 'string' && body.code.trim() ? body.code : undefined;
    const language = optionalString(body.language);

    if (code && code.length > LIMITS.code) {
      return jsonError(`Code must be ${LIMITS.code} characters or fewer`, 400);
    }
    if (language && language.length > LIMITS.language) {
      return jsonError(`Language must be ${LIMITS.language} characters or fewer`, 400);
    }
    if (image && image.length > LIMITS.url) return jsonError('Image URL is too long', 400);
```

with

```ts
    const image = optionalString(body.image);
    const video = optionalString(body.video);
    // A code post sends `files`. The older form, `code` with an optional
    // `language`, still works and becomes one file without a name. Code keeps
    // its own whitespace, so it is not trimmed.
    const oldCode = typeof body.code === 'string' && body.code.trim() ? body.code : undefined;
    if (body.files !== undefined && oldCode) return jsonError('Send either files or code, not both', 400);
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

    if (image && image.length > LIMITS.url) return jsonError('Image URL is too long', 400);
```

- Replace `if (image || video || code) return jsonError('A DevBit is a video and a caption only', 400);` with `if (image || video || files) return jsonError('A DevBit is a video and a caption only', 400);`.
- In `Post.create`, replace

```ts
      code,
      language: code ? language : undefined,
```

with

```ts
      files,
      language: files?.[0].language,
```

The feed and post page read code through `postFiles`, so new posts still show their code until Task 3's code view replaces `CodeBlock`. In `components/post.tsx`:
- Add the import `import { postFiles } from "@/lib/code-files"` after the `@/lib/types` import.
- Add after `const comments = post.comments || []`:

```tsx
  // A code post's first file (posts from before files keep their code on the post).
  const [firstFile] = postFiles(post)
```

- Replace

```tsx
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
```

with

```tsx
        ) : firstFile ? (
          <div className="bg-gray-100 dark:bg-gray-800 p-4 overflow-x-auto">
            <div className="flex items-center mb-2">
              <Code className="h-4 w-4 mr-2" />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {firstFile.language}
              </span>
            </div>
            <CodeBlock code={firstFile.code} language={firstFile.language} />
          </div>
```

In `components/post-detail.tsx`:
- Add the import `import { postFiles } from "@/lib/code-files"` after the `@/lib/types` import.
- Add after `const comments = post.comments || []`:

```tsx
  // A code post's first file (posts from before files keep their code on the post).
  const [firstFile] = postFiles(post)
```

- Replace `{post.code && <CodeBlock code={post.code} language={post.language || "javascript"} />}` with `{firstFile && <CodeBlock code={firstFile.code} language={firstFile.language} />}`.
- Replace `) : similarPost.code ? (` with `) : postFiles(similarPost).length > 0 ? (`.

- [ ] **Step 4: Restart the dev server and run the tests**

Restart the dev server (the model changed). Then run:

```bash
npm run typecheck && npm run lint && npm run test:unit
env SMOKE_BASE_URL=http://localhost:3210 npm run smoke -- posts code
```

Expected:
- Typecheck and lint are clean, and the unit run shows `pass 28`.
- The smoke run ends with `0 failed`. The `[code]` section has 27 checks, all `ok`. The `[posts]` checks "code over 20000 characters is 400" and "language over 30 characters is 400" still pass, now with the new messages.

- [ ] **Step 5: Commit**

```bash
git add models/Post.ts lib/types.ts lib/http.ts app/api/posts/route.ts components/post.tsx components/post-detail.tsx scripts/lib/test-users.mjs scripts/smoke.mjs
git commit -m "Store a code post's files; keep the old code and language form working" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU"
```

---

### Task 3: Highlighting and the code view

**Files:**
- Create: `lib/code-highlight.ts`, `scripts/unit/code-highlight.test.mjs`, `components/highlighted-code.tsx`, `components/code-view.tsx`
- Modify: `components/post.tsx`, `components/post-detail.tsx`, `scripts/mobile-check.mjs`
- Delete: `components/code-block.tsx`

**Interfaces:**
- Consumes: `CodeFile`, `FEED_LINES`, `displayLines`, `languageById`, `languageLabel` and `postFiles` (Task 1); `insertLegacyCodePost` (Task 2).
- Produces:
  - `lib/code-highlight.ts`: `type Highlighted = string | { classes: string; content: Highlighted[] }` and `highlight(code: string, language: string): Highlighted[]`.
  - `components/highlighted-code.tsx`: `HighlightedCode({ code, language, maxLines? })`.
  - `components/code-view.tsx`: `CodeView({ files, fold? })` and `COPY_FAILED`.
  - **Attributes the phone check reads:**
    - On the view: `data-code-view`, `data-file-tab`, `data-copy`, `data-show-all`, `data-line-numbers`.
    - On every feed card: `data-post="<id>"`.
  - **In the phone check:** `PAGE_FILES`, and `codePosts` from `seed()` (`{ page, thirty, legacy }`).

- [ ] **Step 1: Write the failing unit test**

`scripts/unit/code-highlight.test.mjs`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import "./app-alias.mjs"

const { LANGUAGES } = await import("../../lib/code-files.ts")
const { highlight } = await import("../../lib/code-highlight.ts")

const text = (pieces) => pieces.map((piece) => (typeof piece === "string" ? piece : text(piece.content))).join("")
const classes = (pieces) => pieces.flatMap((piece) => (typeof piece === "string" ? [] : [piece.classes, ...classes(piece.content)]))

// A line in each language that its grammar has to colour.
const SAMPLES = {
  javascript: "const answer = 42",
  typescript: "let count: number = 1",
  jsx: "const el = <div className=\"a\">hi</div>",
  tsx: "const el: JSX.Element = <App />",
  html: "<h1 class=\"title\">Hi</h1>",
  css: "h1 { color: red; }",
  scss: "$main: red;\nh1 { color: $main; }",
  json: "{ \"name\": \"devgram\" }",
  python: "def greet(name):\n    return name",
  java: "public class App {}",
  csharp: "public class App {}",
  c: "int main(void) { return 0; }",
  cpp: "std::string name = \"a\";",
  go: "func main() {}",
  rust: "fn main() { let x = 1; }",
  php: "<?php echo $name; ?>",
  ruby: "def greet\n  puts 'hi'\nend",
  kotlin: "fun main() { val x = 1 }",
  swift: "let name = \"a\"",
  dart: "void main() { var x = 1; }",
  sql: "SELECT name FROM users",
  bash: "echo \"hi\" && ls",
  yaml: "name: devgram",
  markdown: "# Title\n\n**bold**",
  dockerfile: "FROM node:20\nRUN npm ci",
  graphql: "query { user(id: 1) { name } }",
}

test("every language is coloured by its own grammar", () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), LANGUAGES.map((language) => language.id).sort())
  for (const [id, code] of Object.entries(SAMPLES)) {
    assert.ok(classes(highlight(code, id)).length > 0, `${id} came out as plain text`)
  }
})

test("keeps the code's text exactly", () => {
  const code = "const a = '<b>' && \"&amp;\"\n\tif (a < 1) {}\r\n"
  assert.equal(text(highlight(code, "typescript")), code)
})

test("colours HTML with Prism's markup grammar", () => {
  assert.ok(classes(highlight("<h1>Hi</h1>", "html")).some((name) => name.startsWith("token tag")))
})

test("leaves a language it doesn't know as plain text", () => {
  assert.deepEqual(highlight("PROGRAM-ID. HELLO.", "cobol"), ["PROGRAM-ID. HELLO."])
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test:unit`
Expected: `fail 1`. `code-highlight.test.mjs` can't load `../../lib/code-highlight.ts`, and the other 28 pass.

- [ ] **Step 3: Write the highlighter**

`lib/code-highlight.ts`:

```ts
// Syntax highlighting for code posts: Prism, with a grammar for each language
// in lib/code-files.ts, turned into plain data the code view renders as
// elements (no HTML strings).
import Prism from "prismjs"
import type { Token, TokenStream } from "prismjs"
// Prism's main file has HTML (markup), CSS, C-like and JavaScript. Each of
// these comes after the grammars it builds on.
import "prismjs/components/prism-typescript.js"
import "prismjs/components/prism-jsx.js"
import "prismjs/components/prism-tsx.js"
import "prismjs/components/prism-scss.js"
import "prismjs/components/prism-json.js"
import "prismjs/components/prism-python.js"
import "prismjs/components/prism-java.js"
import "prismjs/components/prism-csharp.js"
import "prismjs/components/prism-c.js"
import "prismjs/components/prism-cpp.js"
import "prismjs/components/prism-go.js"
import "prismjs/components/prism-rust.js"
import "prismjs/components/prism-markup-templating.js"
import "prismjs/components/prism-php.js"
import "prismjs/components/prism-ruby.js"
import "prismjs/components/prism-kotlin.js"
import "prismjs/components/prism-swift.js"
import "prismjs/components/prism-dart.js"
import "prismjs/components/prism-sql.js"
import "prismjs/components/prism-bash.js"
import "prismjs/components/prism-yaml.js"
import "prismjs/components/prism-markdown.js"
import "prismjs/components/prism-docker.js"
import "prismjs/components/prism-graphql.js"
import { languageById } from "@/lib/code-files"

// A piece of highlighted code: plain text, or a token with Prism's class
// names around its own pieces.
export type Highlighted = string | { classes: string; content: Highlighted[] }

function pieces(stream: TokenStream): Highlighted[] {
  if (typeof stream === "string") return [stream]
  if (Array.isArray(stream)) return stream.flatMap(pieces)
  const token = stream as Token
  const aliases = Array.isArray(token.alias) ? token.alias : token.alias ? [token.alias] : []
  return [{ classes: ["token", token.type, ...aliases].join(" "), content: pieces(token.content) }]
}

// The code in highlighted pieces; plain text for a language with no grammar.
export function highlight(code: string, language: string): Highlighted[] {
  const name = languageById(language)?.prism
  const grammar = name ? Prism.languages[name] : undefined
  return grammar ? pieces(Prism.tokenize(code, grammar)) : [code]
}
```

- [ ] **Step 4: Run the unit tests to see them pass**

Run: `npm run test:unit`
Expected: `tests 32`, `pass 32`, `fail 0`.

- [ ] **Step 5: Write the failing phone checks**

In `scripts/mobile-check.mjs`:

1. Change the import from `./lib/test-users.mjs` to:

```js
import { assertSameDatabase, insertLegacyCodePost, removeTestUsers } from "./lib/test-users.mjs"
```

2. After the line `const LONG_LINK = ...`, add:

```js
// Three files that make a page: the script reports the heading's colour,
// which only the CSS file sets, then calls a function that doesn't exist.
const PAGE_FILES = [
  { name: "index.html", language: "html", code: '<!doctype html>\n<h1 id="title">Hello</h1>' },
  { name: "style.css", language: "css", code: "#title { color: rgb(255, 0, 0); }" },
  {
    name: "app.js",
    language: "javascript",
    code: 'console.log("title colour", getComputedStyle(document.getElementById("title")).color)\nnope()',
  },
]
```

3. In `seed()`, replace

```js
  await api("POST", "/api/messages", a.token, { receiver: names.b, content: "better than before" })

  // Mux videos for the playback checks: a video post, and three DevBits.
```

with

```js
  await api("POST", "/api/messages", a.token, { receiver: names.b, content: "better than before" })

  // Code posts: three files that make a page, 30 lines to fold, and one
  // stored the way code posts were before they had files.
  const codePost = async (caption, files) => (await api("POST", "/api/posts", a.token, { caption: `${caption} ${run}`, files }))._id
  const codePosts = {
    page: await codePost("three files", PAGE_FILES),
    thirty: await codePost("thirty lines", [
      { name: "", language: "python", code: Array.from({ length: 30 }, (_, i) => `print(${i + 1})`).join("\n") },
    ]),
    legacy: await insertLegacyCodePost(names.a, { caption: `old code post ${run}`, code: "print('stored the old way')", language: "python" }),
  }

  // Mux videos for the playback checks: a video post, and three DevBits.
```

and replace `return { a, b, postId: code._id, videoPostId, devbits }` with `return { a, b, postId: code._id, videoPostId, devbits, codePosts }`.

4. In `main()`, replace `const { a, b, postId, videoPostId, devbits } = await seed()` with `const { a, b, postId, videoPostId, devbits, codePosts } = await seed()`.

5. Insert the code-post checks right before `    console.log("\n[messages]")`:

```js
    console.log("\n[code posts]")
    await open(page, `/p/${codePosts.page}`)
    await shellChecks(page, "three-file post", { back: true, tabs })
    await tabRowChecks(page, "three-file post", 3)
    const fileTabs = await page.evaluate(
      `[...document.querySelectorAll("main [data-code-view] [data-file-tab]")].map((tab) => ({ name: tab.textContent.trim(), height: tab.getBoundingClientRect().height }))`,
    )
    check("three-file post: a tab per file, in order", fileTabs.map((tab) => tab.name).join(" ") === "index.html style.css app.js", JSON.stringify(fileTabs))
    check(
      `three-file post: file tabs are at least ${TAP_TARGET}px tall`,
      fileTabs.length === 3 && fileTabs.every((tab) => tab.height >= TAP_TARGET),
      JSON.stringify(fileTabs),
    )
    const numbered = await page.evaluate(`document.querySelector("main [data-code-view] [data-line-numbers]")?.children.length ?? 0`)
    check("three-file post: the open file has a number on each line", numbered === 2, `${numbered} line numbers`)
    const copyHeight = await page.evaluate(`document.querySelector("main [data-code-view] [data-copy]")?.getBoundingClientRect().height ?? 0`)
    check(`three-file post: Copy is at least ${TAP_TARGET}px tall`, copyHeight >= TAP_TARGET, `height ${copyHeight}px`)

    // Copy goes through the clipboard; these stand-ins record what it gets, or refuse.
    const clipboard = (body) => `void Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: ${body} })`
    const copyButton = `document.querySelector("main [data-code-view] [data-copy]")`
    await page.evaluate(clipboard(`async (text) => { window.__copied = text }`))
    await page.evaluate(click(copyButton))
    check("three-file post: Copy copies the open file", await page.waitFor(`window.__copied === ${JSON.stringify(PAGE_FILES[0].code)}`, { timeout: 5000 }))
    check("three-file post: then says Copied ✓", await page.waitFor(`${copyButton}.textContent.includes("Copied ✓")`, { timeout: 5000 }))
    await page.evaluate(click(`[...document.querySelectorAll("main [data-code-view] [data-file-tab]")].find((tab) => tab.textContent.trim() === "style.css")`))
    await page.evaluate(click(copyButton))
    check("three-file post: Copy follows the open tab", await page.waitFor(`window.__copied === ${JSON.stringify(PAGE_FILES[1].code)}`, { timeout: 5000 }))
    await page.evaluate(clipboard(`async () => { throw new Error("denied") }`))
    await page.evaluate(click(copyButton))
    check(
      "three-file post: a refused copy says what to do instead",
      await page.waitFor(`document.body.textContent.includes("Couldn't copy — select the code instead")`, { timeout: 5000 }),
    )

    await open(page, "/")
    const card = (id) => `document.querySelector('main [data-post="${id}"]')`
    const shownLines = `(${card(codePosts.thirty)}?.querySelector("[data-line-numbers]")?.children.length ?? 0)`
    const folded = await page.evaluate(shownLines)
    check("feed: a 30-line file shows its first 20 lines", folded === 20, `${folded} lines`)
    const showAll = await page.evaluate(`${card(codePosts.thirty)}?.querySelector("[data-show-all]")?.getBoundingClientRect().height ?? 0`)
    check(`feed: Show all is at least ${TAP_TARGET}px tall`, showAll >= TAP_TARGET, `height ${showAll}px`)
    await page.evaluate(click(`${card(codePosts.thirty)}?.querySelector("[data-show-all]")`))
    check("feed: Show all shows all 30", await page.waitFor(`${shownLines} === 30`, { timeout: 5000 }))
    const legacy = await page.evaluate(`(() => {
      const card = ${card(codePosts.legacy)}
      const view = card?.querySelector("[data-code-view]")
      if (!view) return null
      return {
        header: view.firstElementChild.textContent.trim(),
        code: view.querySelector("pre").textContent,
        labels: card.textContent.split("Python").length - 1,
      }
    })()`)
    check(
      "feed: a code post stored the old way shows its code under one Python label",
      legacy?.code === "print('stored the old way')" && legacy.header.startsWith("Python") && legacy.labels === 1,
      JSON.stringify(legacy),
    )

```

6. In the `[small phone]` section, replace

```js
    check("small phone, devbits: fits the width of the screen", fitsScreen(smallDevbits, SMALL_PHONE), widthDetail(smallDevbits, SMALL_PHONE))
    await open(page, "/notifications")
```

with

```js
    check("small phone, devbits: fits the width of the screen", fitsScreen(smallDevbits, SMALL_PHONE), widthDetail(smallDevbits, SMALL_PHONE))
    await open(page, `/p/${codePosts.page}`)
    const smallCode = await page.evaluate(SHELL)
    check("small phone, three-file post: fits the width of the screen", fitsScreen(smallCode, SMALL_PHONE), widthDetail(smallCode, SMALL_PHONE))
    await tabRowChecks(page, "small phone, three-file post", 3)
    await open(page, `/p/${postId}`)
    const smallWide = await page.evaluate(SHELL)
    check("small phone, a 300-character line: fits the width of the screen", fitsScreen(smallWide, SMALL_PHONE), widthDetail(smallWide, SMALL_PHONE))
    await open(page, "/notifications")
```

- [ ] **Step 6: Run the phone check to see it fail**

Run: `PHONE_CHECK`
Expected:
- `FAIL` on the new checks that need the code view: "three-file post: has a row of 3 tabs", "three-file post: a tab per file, in order", "…has a number on each line", "Copy is at least 44px tall", the Copy checks, the "feed:" fold and legacy checks, and "small phone, three-file post: has a row of 3 tabs".
- The page-width checks pass, and every check from before passes.

- [ ] **Step 7: Write the highlighted code and the code view**

`components/highlighted-code.tsx`:

```tsx
import { Fragment } from "react"
import "prismjs/themes/prism-tomorrow.css"
import { displayLines } from "@/lib/code-files"
import { highlight, type Highlighted } from "@/lib/code-highlight"

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
  // Show only the first lines (the feed folds long files).
  maxLines?: number
}

// Code with a number on each line and Prism's colours. Long lines scroll
// sideways inside the block while the numbers stay put.
export function HighlightedCode({ code, language, maxLines }: HighlightedCodeProps) {
  const lines = displayLines(code).slice(0, maxLines)
  return (
    <div className="flex bg-zinc-950 font-mono text-[13px] leading-5 text-zinc-200">
      <div aria-hidden="true" data-line-numbers className="shrink-0 select-none border-r border-zinc-800 py-3 pl-3 pr-2 text-right text-zinc-500">
        {lines.map((_, index) => (
          <div key={index}>{index + 1}</div>
        ))}
      </div>
      <pre className="m-0 min-w-0 flex-1 overflow-x-auto px-3 py-3 [tab-size:4]">
        <code>
          <Pieces pieces={highlight(lines.join("\n"), language)} />
        </code>
      </pre>
    </div>
  )
}
```

`components/code-view.tsx`:

```tsx
"use client"

import { useState } from "react"
import { Copy } from "lucide-react"
import toast from "react-hot-toast"
import { HighlightedCode } from "@/components/highlighted-code"
import { FEED_LINES, displayLines, languageLabel, type CodeFile } from "@/lib/code-files"
import { cn } from "@/lib/utils"

export const COPY_FAILED = "Couldn't copy — select the code instead"

// The header's buttons: at least 44px tall on phones.
const headerButton =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white md:min-h-9"

interface CodeViewProps {
  files: CodeFile[]
  // In the feed, a file longer than 20 lines folds behind "Show all".
  fold?: boolean
}

// A code post's files, the same in the feed and on the post page: a tab per
// file (or the one file's name or language), Copy, line numbers and colours.
export function CodeView({ files, fold = false }: CodeViewProps) {
  const [active, setActive] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const current = Math.min(active, files.length - 1)
  const file = files[current]
  const folded = fold && !expanded && displayLines(file.code).length > FEED_LINES

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
      </div>
      <HighlightedCode code={file.code} language={file.language} maxLines={folded ? FEED_LINES : undefined} />
      {folded && (
        <button
          type="button"
          data-show-all
          onClick={() => setExpanded(true)}
          className="min-h-11 w-full border-t border-zinc-800 text-sm text-sky-400 hover:bg-zinc-900 md:min-h-9"
        >
          Show all
        </button>
      )}
    </div>
  )
}
```

`components/post.tsx`:
- Replace the import `import { CodeBlock } from "@/components/code-block"` with `import { CodeView } from "@/components/code-view"`.
- Remove `Code, ` from the `lucide-react` import, which becomes `import { Heart, MessageCircle, Bookmark, MoreHorizontal, Image as ImageIcon } from "lucide-react"`.
- Replace

```tsx
  // A code post's first file (posts from before files keep their code on the post).
  const [firstFile] = postFiles(post)
```

with

```tsx
  const files = postFiles(post)
```

- On the card's outer element, replace `<div className="bg-white dark:bg-gray-900 rounded-lg shadow-md overflow-hidden">` with `<div data-post={post._id} className="bg-white dark:bg-gray-900 rounded-lg shadow-md overflow-hidden">`.
- Replace

```tsx
        ) : firstFile ? (
          <div className="bg-gray-100 dark:bg-gray-800 p-4 overflow-x-auto">
            <div className="flex items-center mb-2">
              <Code className="h-4 w-4 mr-2" />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {firstFile.language}
              </span>
            </div>
            <CodeBlock code={firstFile.code} language={firstFile.language} />
          </div>
```

with

```tsx
        ) : files.length > 0 ? (
          <CodeView files={files} fold />
```

`components/post-detail.tsx`:
- Replace the import `import { CodeBlock } from "@/components/code-block"` with `import { CodeView } from "@/components/code-view"`.
- Replace

```tsx
  // A code post's first file (posts from before files keep their code on the post).
  const [firstFile] = postFiles(post)
```

with

```tsx
  const files = postFiles(post)
```

- Replace `{firstFile && <CodeBlock code={firstFile.code} language={firstFile.language} />}` with `{files.length > 0 && <CodeView files={files} />}`.

Delete the old block:

```bash
git rm components/code-block.tsx
```

- [ ] **Step 8: Run everything to see it pass**

Run: `npm run typecheck && npm run lint && npm run test:unit`, then `PHONE_CHECK`.

Expected:
- Typecheck and lint are clean, and the unit run shows `pass 32`.
- The phone check ends with `0 failed`, including every `[code posts]` and small-phone code check.

- [ ] **Step 9: Commit**

```bash
git add lib/code-highlight.ts scripts/unit/code-highlight.test.mjs components/highlighted-code.tsx components/code-view.tsx components/post.tsx components/post-detail.tsx scripts/mobile-check.mjs
git commit -m "Show code posts in one code view: file tabs, Copy, line numbers, folding in the feed" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU"
```

---

### Task 4: Run

**Files:**
- Create: `lib/code-run.ts`, `scripts/unit/code-run.test.mjs`, `components/code-run.tsx`
- Modify: `components/code-view.tsx`, `scripts/mobile-check.mjs`

**Interfaces:**
- Consumes: `CodeFile` (Task 1), and `CodeView` and `headerButton` (Task 3).
- Produces (`lib/code-run.ts`):
  - **Constants:** `RUN_SECONDS = 5`, `MAX_RUN_LINES = 200`, `MAX_LINE_CHARS = 1000`, `STOPPED`, `CANT_RUN`.
  - **Types:** `type RunKind = "page" | "script"`, `type RunLevel = "log" | "info" | "warn" | "error"` and `interface RunLine { level: RunLevel; text: string }`.
  - **Bridge sources:** `PAGE_BRIDGE` and `WORKER_SOURCE`.
  - **Functions:**
    - `runKind(files): RunKind | null`
    - `buildRunDocument(files): string | null`
    - `readRunMessage(data: unknown): { done: true } | { lines: RunLine[] } | null`
    - `appendLines(current, incoming): RunLine[]`
- Produces (`components/code-run.tsx`): `CodeRun({ files, onFinish })`.
- **Attributes the phone check reads:** `data-run` (the Run button), `data-run-output`, `data-run-line` with `data-level`.

- [ ] **Step 1: Write the failing unit test**

`scripts/unit/code-run.test.mjs`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import vm from "node:vm"
import {
  CANT_RUN,
  MAX_LINE_CHARS,
  PAGE_BRIDGE,
  WORKER_SOURCE,
  appendLines,
  buildRunDocument,
  readRunMessage,
  runKind,
} from "../../lib/code-run.ts"

const file = (name, language, code) => ({ name, language, code })
const html = file("index.html", "html", '<!DOCTYPE html>\n<h1 id="t">Hi</h1>')
const css = file("style.css", "css", "h1 { color: red }")
const js = file("app.js", "javascript", "console.log(1)")
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test("runs posts with HTML as a page and JavaScript-only posts as a script", () => {
  assert.equal(runKind([css, html, js]), "page")
  assert.equal(runKind([js, file("b.js", "javascript", "x")]), "script")
  for (const files of [[css], [file("a.ts", "typescript", "x")], [file("a.jsx", "jsx", "x")], [file("a.py", "python", "x")]]) {
    assert.equal(runKind(files), null, files[0].language)
  }
  assert.equal(buildRunDocument([css]), null)
})

test("builds a page from the first HTML file, with the bridge first and CSS and JavaScript in file order", () => {
  const other = file("other.html", "html", "<p>never shown</p>")
  const css2 = file("more.css", "css", "p { margin: 0 }")
  const js2 = file("more.js", "javascript", "console.log(2)")
  const doc = buildRunDocument([css, html, js, other, css2, js2])
  assert.ok(doc.startsWith("<!DOCTYPE html><script>"), "the doctype stays first, the bridge right after it")
  assert.ok(doc.includes(PAGE_BRIDGE))
  assert.ok(!doc.includes("never shown"))
  const at = (needle) => doc.indexOf(needle)
  assert.ok(at(PAGE_BRIDGE) < at("<style>h1 { color: red }</style>"))
  assert.ok(at("<style>h1 { color: red }</style>") < at("<style>p { margin: 0 }</style>"))
  assert.ok(at("<style>p { margin: 0 }</style>") < at('<h1 id="t">Hi</h1>'))
  assert.ok(at('<h1 id="t">Hi</h1>') < at("<script>console.log(1)</script>"))
  assert.ok(at("<script>console.log(1)</script>") < at("<script>console.log(2)</script>"))
})

test("puts the bridge first in a page without a doctype", () => {
  assert.ok(buildRunDocument([file("a.html", "html", "<p>hi</p>")]).startsWith("<script>(() => {"))
})

test("a file's own </script> or </style> can't end its element early", () => {
  const sneaky = file("a.js", "javascript", 'const s = "</script><img src=x onerror=alert(1)>"; console.log(s)')
  const sneakyCss = file("a.css", "css", "p::after { content: '</STYLE><b>' }")
  const page = buildRunDocument([html, sneakyCss, sneaky])
  assert.equal(page.match(/<\/script/gi).length, 2, "the bridge's end tag and the file's own")
  assert.equal(page.match(/<\/style/gi).length, 1)
  assert.ok(page.includes('"<\\/script><img'))
  const script = buildRunDocument([sneaky])
  assert.equal(script.match(/<\/script/gi).length, 1)
  assert.equal(script.match(/<script/gi).length, 1)
})

test("a script run's frame hands every JavaScript file to the worker in order", () => {
  const doc = buildRunDocument([js, css, file("b.js", "javascript", "console.log('<b>')")])
  assert.ok(doc.includes(JSON.stringify(["console.log(1)", "console.log('<b>')"]).replace(/</g, "\\u003c")))
  assert.ok(!doc.includes("console.log('<b>')"), "a < from a file can't open a tag in the frame")
  assert.ok(doc.includes(JSON.stringify(CANT_RUN)))
})

// A stand-in for a worker: a fresh global with the browser bits the worker
// source uses. importScripts runs a file as a script in that global, as a
// worker does, so top-level names carry over between files.
function fakeWorker() {
  const posted = []
  const blobs = new Map()
  const context = vm.createContext({
    // Real postMessage hands over a copy, made in the receiving page.
    postMessage: (message) => posted.push(structuredClone(message)),
    addEventListener: () => {},
    setTimeout,
    clearTimeout,
    Blob: class {
      constructor(parts) {
        this.text = parts.join("")
      }
    },
    URL: {
      createObjectURL: (blob) => {
        const url = `blob:${blobs.size}`
        blobs.set(url, blob.text)
        return url
      },
      revokeObjectURL: (url) => blobs.delete(url),
    },
  })
  context.importScripts = (url) => vm.runInContext(blobs.get(url), context)
  vm.runInContext(WORKER_SOURCE, context)
  const lines = () => posted.flatMap((message) => message.lines ?? [])
  return { context, posted, lines, run: (sources) => context.onmessage({ data: sources }) }
}

test("the worker runs each file like its own script tag and reports errors in red", () => {
  const worker = fakeWorker()
  worker.run([
    "const shared = 41",
    "console.log('shared + 1 =', shared + 1, { ok: true }, [1, 'two'], null, undefined)",
    "this is not javascript",
    "throw new TypeError('boom')",
    "console.warn('still running'); console.info('info'); alert('hello')",
  ])
  assert.deepEqual(worker.lines(), [
    { level: "log", text: 'shared + 1 = 42 {"ok":true} [1,"two"] null undefined' },
    { level: "error", text: worker.lines()[1].text },
    { level: "error", text: "TypeError: boom" },
    { level: "warn", text: "still running" },
    { level: "info", text: "info" },
    { level: "log", text: "hello" },
  ])
  assert.match(worker.lines()[1].text, /^SyntaxError: /)
  assert.deepEqual(worker.posted.at(-1), { devgramRun: "done" })
})

test("the worker sends at most 200 waiting lines, each cut to 1,000 characters", () => {
  const worker = fakeWorker()
  worker.run(["console.log('first')", "for (let i = 0; i < 1000; i++) console.log(i)", "console.log('x'.repeat(5000))"])
  const lines = worker.lines()
  assert.equal(lines[0].text, "first")
  assert.ok(lines.length <= 201, `${lines.length} lines`)
  assert.equal(lines.at(-2).text, "999")
  assert.equal(lines.at(-1).text, "x".repeat(MAX_LINE_CHARS) + "…")
})

test("the worker's own names can't clash with a post's", () => {
  const worker = fakeWorker()
  worker.run(["const send = 1, queue = 2, flush = 3, write = 4, describe = 5; console.log(send + queue + flush + write + describe)"])
  assert.deepEqual(worker.lines(), [{ level: "log", text: "15" }])
})

test("the page bridge sends console output, alerts and errors to the parent page", async () => {
  const posted = []
  const listeners = {}
  const context = vm.createContext({
    window: {},
    parent: { postMessage: (message, origin) => posted.push({ message: structuredClone(message), origin }) },
    addEventListener: (type, listener) => (listeners[type] = listener),
    setTimeout,
    clearTimeout,
  })
  vm.runInContext(PAGE_BRIDGE, context)
  vm.runInContext("console.log('a', 1); alert('hi')", context)
  let prevented = false
  listeners.error({ error: new RangeError("too far"), preventDefault: () => (prevented = true) })
  listeners.unhandledrejection({ reason: "nope", preventDefault: () => {} })
  await sleep(150)
  assert.ok(prevented)
  assert.ok(posted.every((entry) => entry.origin === "*"))
  assert.deepEqual(posted.flatMap((entry) => entry.message.lines), [
    { level: "log", text: "a 1" },
    { level: "log", text: "hi" },
    { level: "error", text: "RangeError: too far" },
    { level: "error", text: "Uncaught (in promise) nope" },
  ])
})

test("reads only well-formed messages from a run frame, and cuts what it keeps", () => {
  assert.deepEqual(readRunMessage({ devgramRun: "done" }), { done: true })
  for (const data of [null, "done", 5, {}, { devgramRun: "lines" }, { devgramRun: "lines", lines: "x" }, { devgramRun: "other" }]) {
    assert.equal(readRunMessage(data), null, JSON.stringify(data))
  }
  const message = readRunMessage({
    devgramRun: "lines",
    lines: [{ level: "error", text: "bad" }, { level: "shout", text: "odd level" }, { text: 5 }, null, { level: "log", text: "y".repeat(2000) }],
  })
  assert.deepEqual(message.lines.slice(0, 2), [{ level: "error", text: "bad" }, { level: "log", text: "odd level" }])
  assert.equal(message.lines.length, 3)
  assert.equal(message.lines[2].text, "y".repeat(MAX_LINE_CHARS) + "…")
  const many = readRunMessage({ devgramRun: "lines", lines: Array.from({ length: 500 }, (_, i) => ({ level: "log", text: String(i) })) })
  assert.equal(many.lines.length, 200)
  assert.equal(many.lines[0].text, "300")
})

test("the panel keeps the newest 200 lines", () => {
  const line = (text) => ({ level: "log", text })
  const current = Array.from({ length: 150 }, (_, i) => line(String(i)))
  const next = appendLines(current, Array.from({ length: 100 }, (_, i) => line(String(150 + i))))
  assert.equal(next.length, 200)
  assert.equal(next[0].text, "50")
  assert.equal(next.at(-1).text, "249")
  assert.deepEqual(appendLines([], [line("a")]), [line("a")])
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test:unit`
Expected: `fail 1`. `code-run.test.mjs` can't load `../../lib/code-run.ts`, and the other 32 pass.

- [ ] **Step 3: Write the Run module**

`lib/code-run.ts`:

```ts
// What Run does with a code post's files: which posts can run, the document
// the run frame loads, and reading what that frame sends back. Nothing here
// is imported at run time, so the unit tests load it in Node.
import type { CodeFile } from "@/lib/code-files"

// A JavaScript run is stopped after this long.
export const RUN_SECONDS = 5
// The output panel keeps this many lines, each cut at this many characters.
export const MAX_RUN_LINES = 200
export const MAX_LINE_CHARS = 1000

export const STOPPED = "Stopped after 5 seconds"
export const CANT_RUN = "This browser can't run JavaScript here"

export type RunKind = "page" | "script"
export type RunLevel = "log" | "info" | "warn" | "error"
export interface RunLine {
  level: RunLevel
  text: string
}

// A post with an HTML file runs as a page (with its CSS and JavaScript); one
// with JavaScript and no HTML runs as a script. Other posts can't run.
export function runKind(files: CodeFile[]): RunKind | null {
  if (files.some((file) => file.language === "html")) return "page"
  if (files.some((file) => file.language === "javascript")) return "script"
  return null
}

// Runs first in the frame, or in the worker: sends console output, alert()
// and errors to the code view. It keeps to itself, so a post's own names
// can't clash with it. Lines go out at most every 100 ms and only the newest
// 200 wait, so code that logs in an endless loop can't flood the page.
const bridge = (extra: string) => `(() => {
  const send = typeof window === "undefined" ? postMessage.bind(globalThis) : (message) => parent.postMessage(message, "*")
  let queue = []
  let sentAt = 0
  let timer = 0
  const describe = (value) => {
    if (typeof value === "string") return value
    if (Object.prototype.toString.call(value) === "[object Error]") {
      return value.name + ": " + String(value.message).replace("Failed to execute 'importScripts' on 'WorkerGlobalScope': ", "")
    }
    if (typeof value === "function") return "function " + (value.name || "(anonymous)")
    if (typeof value === "object" && value !== null) {
      try {
        return JSON.stringify(value)
      } catch {
        return String(value)
      }
    }
    return String(value)
  }
  const flush = () => {
    clearTimeout(timer)
    timer = 0
    sentAt = Date.now()
    if (queue.length === 0) return
    send({ devgramRun: "lines", lines: queue })
    queue = []
  }
  const write = (level, values) => {
    const text = values.map(describe).join(" ")
    queue.push({ level, text: text.length > ${MAX_LINE_CHARS} ? text.slice(0, ${MAX_LINE_CHARS}) + "…" : text })
    if (queue.length > ${MAX_RUN_LINES}) queue.splice(0, queue.length - ${MAX_RUN_LINES})
    if (Date.now() - sentAt >= 100) flush()
    else if (!timer) timer = setTimeout(flush, 100)
  }
  const levels = { log: "log", debug: "log", trace: "log", dir: "log", table: "log", info: "info", warn: "warn", error: "error" }
  const target = globalThis.console || (globalThis.console = {})
  for (const [method, level] of Object.entries(levels)) target[method] = (...values) => write(level, values)
  globalThis.alert = (message) => write("log", [message === undefined ? "" : message])
  addEventListener("error", (event) => {
    event.preventDefault()
    write("error", [event.error ?? event.message])
  })
  addEventListener("unhandledrejection", (event) => {
    event.preventDefault()
    write("error", ["Uncaught (in promise)", event.reason])
  })
  ${extra}
})()`

export const PAGE_BRIDGE = bridge("")

// The worker runs each file as its own script, like separate script tags: a
// later file sees an earlier one's names, and an error in one file doesn't
// stop the next. Then it says it's done.
export const WORKER_SOURCE = bridge(`globalThis.onmessage = (event) => {
    for (const code of event.data) {
      const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }))
      try {
        importScripts(url)
      } catch (error) {
        write("error", [error])
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    flush()
    send({ devgramRun: "done" })
  }`)

// JSON that can sit inside a script element.
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c")

// A file's own </script> or </style> would end its element early.
const inline = (code: string, tag: "script" | "style") => code.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1")

// The frame of a JavaScript-only run: it starts the worker, hands it the
// files and passes on what it sends.
const scriptHost = (sources: string[]) => `(() => {
  const tell = (message) => parent.postMessage(message, "*")
  const cantRun = () => {
    tell({ devgramRun: "lines", lines: [{ level: "error", text: ${JSON.stringify(CANT_RUN)} }] })
    tell({ devgramRun: "done" })
  }
  let worker
  try {
    worker = new Worker(URL.createObjectURL(new Blob([${scriptJson(WORKER_SOURCE)}], { type: "text/javascript" })))
  } catch {
    return cantRun()
  }
  worker.onmessage = (event) => tell(event.data)
  worker.onerror = (event) => {
    event.preventDefault()
    cantRun()
  }
  worker.postMessage(${scriptJson(sources)})
})()`

// The document a run frame loads, or null when the files can't run. A page
// is the first HTML file with the bridge first (after its doctype, which
// has to lead), the CSS files as styles before it and the JavaScript files
// as scripts after it, each in file order.
export function buildRunDocument(files: CodeFile[]): string | null {
  const kind = runKind(files)
  const scripts = files.filter((file) => file.language === "javascript")
  if (kind === "page") {
    const page = files.find((file) => file.language === "html")!.code
    const doctype = page.match(/^\s*<!doctype[^>]*>/i)?.[0] ?? ""
    const styles = files
      .filter((file) => file.language === "css")
      .map((file) => `<style>${inline(file.code, "style")}</style>\n`)
      .join("")
    const tags = scripts.map((file) => `\n<script>${inline(file.code, "script")}</script>`).join("")
    return `${doctype}<script>${PAGE_BRIDGE}</script>\n${styles}${page.slice(doctype.length)}${tags}`
  }
  if (kind === "script") {
    return `<!doctype html><script>${scriptHost(scripts.map((file) => file.code))}</script>`
  }
  return null
}

const LEVELS: RunLevel[] = ["log", "info", "warn", "error"]
const cut = (text: string) => (text.length > MAX_LINE_CHARS ? `${text.slice(0, MAX_LINE_CHARS)}…` : text)

// A message from a run frame, or null when it isn't one. The frame runs the
// post's code, so nothing it sends is trusted: lines are checked and cut.
export function readRunMessage(data: unknown): { done: true } | { lines: RunLine[] } | null {
  if (typeof data !== "object" || data === null) return null
  const message = data as { devgramRun?: unknown; lines?: unknown }
  if (message.devgramRun === "done") return { done: true }
  if (message.devgramRun !== "lines" || !Array.isArray(message.lines)) return null
  const lines = message.lines.slice(-MAX_RUN_LINES).flatMap((line: unknown): RunLine[] => {
    if (typeof line !== "object" || line === null) return []
    const { level, text } = line as { level?: unknown; text?: unknown }
    if (typeof text !== "string") return []
    return [{ level: LEVELS.includes(level as RunLevel) ? (level as RunLevel) : "log", text: cut(text) }]
  })
  return { lines }
}

// The output panel keeps the newest 200 lines.
export function appendLines(current: RunLine[], incoming: RunLine[]): RunLine[] {
  return [...current, ...incoming].slice(-MAX_RUN_LINES)
}
```

- [ ] **Step 4: Run the unit tests to see them pass**

Run: `npm run test:unit`
Expected: `tests 43`, `pass 43`, `fail 0`.

- [ ] **Step 5: Write the failing phone checks**

In `scripts/mobile-check.mjs`:

1. In `seed()`, add three posts to `codePosts`. Replace

```js
    legacy: await insertLegacyCodePost(names.a, { caption: `old code post ${run}`, code: "print('stored the old way')", language: "python" }),
  }
```

with

```js
    legacy: await insertLegacyCodePost(names.a, { caption: `old code post ${run}`, code: "print('stored the old way')", language: "python" }),
    // Two files that share a name, one log now and one a moment later.
    script: await codePost("script", [
      { name: "greet.js", language: "javascript", code: 'const who = "a worker"' },
      { name: "main.js", language: "javascript", code: 'console.log("hello from " + who)\nsetTimeout(() => console.log("a moment later"), 300)' },
    ]),
    loop: await codePost("endless loop", [{ name: "loop.js", language: "javascript", code: "let i = 0\nwhile (true) { i++ }" }]),
    flood: await codePost("endless logging", [{ name: "flood.js", language: "javascript", code: "let i = 0\nwhile (true) console.log(i++)" }]),
  }
```

2. Insert the Run checks right before `    console.log("\n[messages]")`, after the `[code posts]` checks from Task 3:

```js
    console.log("\n[running code]")
    const runButton = `document.querySelector("main [data-code-view] [data-run]")`
    const output = `(document.querySelector("main [data-run-output]")?.textContent ?? "")`
    await open(page, `/p/${codePosts.page}`)
    check("three-file post: nothing runs until Run is pressed", !(await page.evaluate(`Boolean(document.querySelector("main iframe"))`)))
    const runHeight = await page.evaluate(`${runButton}?.getBoundingClientRect().height ?? 0`)
    check(`three-file post: Run is at least ${TAP_TARGET}px tall`, runHeight >= TAP_TARGET, `height ${runHeight}px`)
    await page.evaluate(click(runButton))
    const sandbox = await page.evaluate(`document.querySelector("main [data-code-view] iframe")?.getAttribute("sandbox") ?? null`)
    check('three-file post: Run shows the page in a frame whose sandbox is exactly "allow-scripts"', sandbox === "allow-scripts", JSON.stringify(sandbox))
    check(
      "three-file post: the page runs with its CSS and JavaScript",
      await page.waitFor(`${output}.includes("title colour rgb(255, 0, 0)")`, { timeout: 10000 }),
    )
    // Tailwind's colours are oklch(lightness chroma hue); red sits near hue 25.
    const errorLine = await page.evaluate(`(() => {
      const error = [...document.querySelectorAll('main [data-run-line][data-level="error"]')][0]
      const match = error && /oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)/.exec(getComputedStyle(error).color)
      return error ? { text: error.textContent, chroma: match ? Number(match[2]) : null, hue: match ? Number(match[3]) : null } : null
    })()`)
    check(
      "three-file post: the page's errors show in red",
      errorLine?.text === "ReferenceError: nope is not defined" && errorLine.chroma > 0.1 && (errorLine.hue < 45 || errorLine.hue > 340),
      JSON.stringify(errorLine),
    )
    check("three-file post: Run turns into Stop", (await page.evaluate(`${runButton}.textContent.trim()`)) === "Stop")
    await page.evaluate(click(runButton))
    check("three-file post: Stop removes the running page", await page.waitFor(`!document.querySelector("main [data-code-view] iframe")`, { timeout: 5000 }))

    await open(page, `/p/${codePosts.script}`)
    await page.evaluate(click(runButton))
    check(
      "script post: files share their names, and output that comes a moment later still shows",
      await page.waitFor(`${output}.includes("hello from a worker") && ${output}.includes("a moment later")`, { timeout: 10000 }),
    )
    check("script post: Run comes back once the code has finished", await page.waitFor(`${runButton}.textContent.trim() === "Run"`, { timeout: 5000 }))
    await sleep(5500)
    check("script post: a run that finished isn't reported as stopped", !(await page.evaluate(`${output}.includes("Stopped after 5 seconds")`)))

    // While code runs, the page's own timers have to keep firing on time.
    const runUntilStopped = async (label, id) => {
      await open(page, `/p/${id}`)
      await page.evaluate(`(() => {
        window.__lateBy = 0
        let last = performance.now()
        window.__ticker = setInterval(() => {
          const now = performance.now()
          window.__lateBy = Math.max(window.__lateBy, now - last - 50)
          last = now
        }, 50)
      })()`)
      const started = Date.now()
      await page.evaluate(click(runButton))
      const stopped = await page.waitFor(`${output}.includes("Stopped after 5 seconds")`, { timeout: 10000 })
      const seconds = (Date.now() - started) / 1000
      const state = await page.evaluate(`(() => {
        clearInterval(window.__ticker)
        return {
          lateBy: Math.round(window.__lateBy),
          lines: document.querySelectorAll("main [data-run-line]").length,
          frame: Boolean(document.querySelector("main [data-code-view] iframe")),
          button: ${runButton}.textContent.trim(),
        }
      })()`)
      check(`${label}: stopped after 5 seconds`, stopped && seconds >= 4.5, `${seconds.toFixed(1)}s ${JSON.stringify(state)}`)
      check(`${label}: the page kept responding`, state.lateBy < 500, `timers ran up to ${state.lateBy}ms late`)
      check(`${label}: its frame is gone and Run is back`, !state.frame && state.button === "Run", JSON.stringify(state))
      return state
    }
    await runUntilStopped("endless loop", codePosts.loop)
    const flood = await runUntilStopped("endless logging", codePosts.flood)
    check("endless logging: the panel keeps at most 200 lines", flood.lines > 1 && flood.lines <= 200, `${flood.lines} lines`)

```

- [ ] **Step 6: Run the phone check to see it fail**

Run: `PHONE_CHECK`
Expected:
- "three-file post: nothing runs until Run is pressed" passes.
- `FAIL` for Run's height, the sandbox, the page's output and its red error, because there is no Run button. Then the run ends early with `FAIL the check stopped early -- TypeError: Cannot read properties of null (reading 'textContent')`.
- Every check before `[running code]` passes.

- [ ] **Step 7: Write the run panel and add Run to the code view**

`components/code-run.tsx`:

```tsx
"use client"

import { useLayoutEffect, useRef, useState } from "react"
import type { CodeFile } from "@/lib/code-files"
import {
  RUN_SECONDS,
  STOPPED,
  appendLines,
  buildRunDocument,
  readRunMessage,
  runKind,
  type RunLevel,
  type RunLine,
} from "@/lib/code-run"
import { cn } from "@/lib/utils"

const LINE_COLOURS: Record<RunLevel, string> = {
  log: "text-zinc-200",
  info: "text-sky-300",
  warn: "text-amber-300",
  error: "text-red-400",
}

interface CodeRunProps {
  files: CodeFile[]
  // A JavaScript run has ended: it finished, or was stopped after 5 seconds.
  // A page runs until the code view removes it.
  onFinish: () => void
}

// One run of a post's code. The frame may run scripts and nothing else: it
// gets no access to Devgram's storage, cookies or sign-in, can't open popups
// and can't move the page.
export function CodeRun({ files, onFinish }: CodeRunProps) {
  const frame = useRef<HTMLIFrameElement>(null)
  const output = useRef<HTMLDivElement>(null)
  const finish = useRef(onFinish)
  // A post's files don't change while it runs.
  const [kind] = useState(() => runKind(files))
  const [srcDoc] = useState(() => buildRunDocument(files))
  const [lines, setLines] = useState<RunLine[]>([])
  const [ended, setEnded] = useState(false)
  // A JavaScript run's frame, and the worker in it, go away after 5 seconds.
  const [frameLive, setFrameLive] = useState(true)

  useLayoutEffect(() => {
    finish.current = onFinish
  })

  // Listening starts before the frame can send anything: layout effects run
  // before the browser goes back to loading the frame.
  useLayoutEffect(() => {
    let done = false
    const end = () => {
      done = true
      setEnded(true)
      finish.current()
    }
    const onMessage = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return
      const message = readRunMessage(event.data)
      if (!message) return
      if ("lines" in message) setLines((current) => appendLines(current, message.lines))
      else if (kind === "script" && !done) end()
    }
    window.addEventListener("message", onMessage)
    const timer =
      kind === "script"
        ? window.setTimeout(() => {
            setFrameLive(false)
            if (done) return
            setLines((current) => appendLines(current, [{ level: "error", text: STOPPED }]))
            end()
          }, RUN_SECONDS * 1000)
        : undefined
    return () => {
      window.removeEventListener("message", onMessage)
      window.clearTimeout(timer)
    }
  }, [kind])

  // The newest output stays in view.
  useLayoutEffect(() => {
    if (output.current) output.current.scrollTop = output.current.scrollHeight
  }, [lines])

  if (!srcDoc) return null
  return (
    <div className="border-t border-zinc-800">
      {frameLive && (
        <iframe
          ref={frame}
          title={kind === "page" ? "Preview" : "JavaScript run"}
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          className={kind === "page" ? "block h-72 w-full bg-white" : "hidden"}
        />
      )}
      {(kind === "script" || lines.length > 0) && (
        <div ref={output} data-run-output className="max-h-64 overflow-auto px-3 py-2 font-mono text-xs leading-5">
          {lines.map((line, index) => (
            <div key={index} data-run-line data-level={line.level} className={cn("whitespace-pre-wrap break-words", LINE_COLOURS[line.level])}>
              {line.text}
            </div>
          ))}
          {lines.length === 0 && <p className="text-zinc-500">{ended ? "No output" : "Running…"}</p>}
        </div>
      )}
    </div>
  )
}
```

`components/code-view.tsx`:
- Replace the imports

```tsx
import { useState } from "react"
import { Copy } from "lucide-react"
import toast from "react-hot-toast"
import { HighlightedCode } from "@/components/highlighted-code"
import { FEED_LINES, displayLines, languageLabel, type CodeFile } from "@/lib/code-files"
```

with

```tsx
import { useCallback, useState } from "react"
import { Copy, Play, Square } from "lucide-react"
import toast from "react-hot-toast"
import { CodeRun } from "@/components/code-run"
import { HighlightedCode } from "@/components/highlighted-code"
import { FEED_LINES, displayLines, languageLabel, type CodeFile } from "@/lib/code-files"
import { runKind } from "@/lib/code-run"
```

- Replace the comment above `export function CodeView` and the start of its body,

```tsx
// A code post's files, the same in the feed and on the post page: a tab per
// file (or the one file's name or language), Copy, line numbers and colours.
export function CodeView({ files, fold = false }: CodeViewProps) {
  const [active, setActive] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
```

with

```tsx
// A code post's files, the same in the feed and on the post page: a tab per
// file (or the one file's name or language), Copy, Run where the files can
// run, line numbers and colours.
export function CodeView({ files, fold = false }: CodeViewProps) {
  const [active, setActive] = useState(0)
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
```

- Add the Run button after Copy, inside the header. Replace

```tsx
              Copy
            </>
          )}
        </button>
      </div>
```

with

```tsx
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
```

- Add the run panel at the bottom of the view. Replace

```tsx
          Show all
        </button>
      )}
    </div>
```

with

```tsx
          Show all
        </button>
      )}
      {run && <CodeRun key={run.id} files={files} onFinish={() => finished(run.id)} />}
    </div>
```

- [ ] **Step 8: Run everything to see it pass**

Run: `npm run typecheck && npm run lint && npm run test:unit`, then `PHONE_CHECK`.

Expected:
- Typecheck and lint are clean, and the unit run shows `pass 43`.
- The phone check ends with `0 failed`. In `[running code]`, both "stopped after 5 seconds" checks report 5–6 s, and "the page kept responding" reports well under 500 ms.

- [ ] **Step 9: Commit**

```bash
git add lib/code-run.ts scripts/unit/code-run.test.mjs components/code-run.tsx components/code-view.tsx scripts/mobile-check.mjs
git commit -m "Run HTML and JavaScript posts in a sandboxed frame; stop JavaScript after 5 seconds" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU"
```

---

### Task 5: Writing code: files, and the plain box with its preview

**Files:**
- Create: `components/code-files-editor.tsx`
- Modify: `components/create-post-form.tsx`, `contexts/posts-context.tsx`, `scripts/mobile-check.mjs`

**Interfaces:**
- Consumes: `LANGUAGES`, `MAX_FILES`, `MAX_FILE_NAME`, `guessLanguage`, `languageLabel`, `parseFiles` and `CodeFile` (Task 1); `HighlightedCode` (Task 3).
- Produces (`components/code-files-editor.tsx`): `interface DraftFile extends CodeFile { key: number }`, `newDraftFile(language?: string): DraftFile`, `CodeFilesEditor({ files, onChange })`, and the `PlainCodeBox` component inside it (Task 6 adds Monaco next to it).
- Produces: `NewPost.files?: CodeFile[]`. `NewPost` no longer has `code` or `language`.
- **Element ids the phone check reads:** `#file-name`, `#file-language`, `#code`, and the preview's `data-code-preview`.
- **In the phone check:** `openCodeTab(target)`, `addFile`, `selectTab(name)`, `postButton`.

- [ ] **Step 1: Write the failing phone checks**

In `scripts/mobile-check.mjs`, insert right before `    console.log("\n[messages]")`:

```js
    console.log("\n[writing code]")
    const openCodeTab = async (target) => {
      await open(target, "/create")
      // Radix tabs switch on mouse down, as a tap starts, not on click().
      await target.evaluate(`[...document.querySelectorAll('[role="tab"]')]
        .find((tab) => tab.textContent.trim() === "Code")
        ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))`)
      await sleep(300)
    }
    const addFile = `[...document.querySelectorAll("main button")].find((b) => b.textContent.includes("Add file"))`
    const selectTab = (name) =>
      click(`[...document.querySelectorAll("main [data-file-tab]")].find((tab) => tab.textContent.trim() === ${JSON.stringify(name)})`)
    const postButton = `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "Post")`
    await openCodeTab(page)
    const box = await page.evaluate(`(() => {
      const area = document.querySelector("main textarea#code")
      return area && {
        autocorrect: area.getAttribute("autocorrect"),
        autocapitalize: area.getAttribute("autocapitalize"),
        spellcheck: area.getAttribute("spellcheck"),
      }
    })()`)
    check("create, code: phones get the plain code box", Boolean(box), "no code box")
    check(
      "create, code: the box leaves autocorrect, capitals and spelling alone",
      box?.autocorrect === "off" && box?.autocapitalize === "off" && box?.spellcheck === "false",
      JSON.stringify(box),
    )
    await page.type("main textarea#code", "const greeting = 'hi'")
    check(
      "create, code: a highlighted preview follows what you type",
      await page.waitFor(
        `(() => { const preview = document.querySelector("main [data-code-preview]"); return Boolean(preview?.textContent.includes("const greeting = 'hi'") && preview.querySelector(".token.keyword")) })()`,
        { timeout: 5000 },
      ),
    )
    const addHeight = await page.evaluate(buttonHeight("Add file"))
    check(`create, code: Add file is at least ${TAP_TARGET}px tall`, addHeight >= TAP_TARGET, `height ${addHeight}px`)
    await page.evaluate(click(addFile))
    await page.type("main input#file-name", "index.html")
    check(
      "create, code: naming a file index.html picks HTML",
      await page.waitFor(`document.querySelector("main #file-language")?.textContent.includes("HTML")`, { timeout: 5000 }),
    )
    await page.type("main textarea#code", "<h1>Hi</h1>")
    const draftTabs = await page.evaluate(
      `[...document.querySelectorAll("main [data-file-tab]")].map((tab) => ({ name: tab.textContent.trim(), height: tab.getBoundingClientRect().height }))`,
    )
    check("create, code: a tab per file", draftTabs.map((tab) => tab.name).join(" ") === "Untitled index.html", JSON.stringify(draftTabs))
    check(
      `create, code: file tabs are at least ${TAP_TARGET}px tall`,
      draftTabs.length === 2 && draftTabs.every((tab) => tab.height >= TAP_TARGET),
      JSON.stringify(draftTabs),
    )
    await tabRowChecks(page, "create, code", 2)

    const codeCaption = `two files ${run}`
    await page.type("#caption", codeCaption)
    await page.evaluate(click(postButton))
    check("create, code: posting asks for a name on every file", await page.waitFor(`document.querySelector("main").textContent.includes("Give each file a name")`, { timeout: 5000 }))
    await page.evaluate(selectTab("Untitled"))
    await page.type("main input#file-name", "index.html")
    await page.evaluate(click(postButton))
    check(
      "create, code: and refuses two files with one name",
      await page.waitFor(`document.querySelector("main").textContent.includes("Two files can't have the same name")`, { timeout: 5000 }),
    )
    await page.evaluate(`(() => { const input = document.querySelector("main input#file-name"); input.focus(); input.select() })()`)
    await page.cdp("Input.insertText", { text: "app.js" })
    // A third file, removed again while it is the open one.
    await page.evaluate(click(addFile))
    await page.type("main input#file-name", "extra.css")
    await page.type("main textarea#code", "p { margin: 0 }")
    await page.evaluate(click(`[...document.querySelectorAll("main button")].find((b) => b.textContent.includes("Remove extra.css"))`))
    const afterRemove = await page.evaluate(`({
      tabs: [...document.querySelectorAll("main [data-file-tab]")].map((tab) => tab.textContent.trim()).join(" "),
      code: document.querySelector("main textarea#code").value,
    })`)
    check(
      "create, code: removing the open file keeps the others as they were",
      afterRemove.tabs === "app.js index.html" && afterRemove.code === "<h1>Hi</h1>",
      JSON.stringify(afterRemove),
    )
    await page.evaluate(selectTab("app.js"))
    check("create, code: each file keeps its own code", (await page.evaluate(`document.querySelector("main textarea#code").value`)) === "const greeting = 'hi'")
    await page.evaluate(click(postButton))
    const codePosted = await page.waitFor(`location.pathname === "/"`, { timeout: 15000 })
    await sleep(800)
    const postedCode = await page.evaluate(`(() => {
      const card = [...document.querySelectorAll("main [data-post]")].find((el) => el.textContent.includes(${JSON.stringify(codeCaption)}))
      return card && {
        tabs: [...card.querySelectorAll("[data-file-tab]")].map((tab) => tab.textContent.trim()).join(" "),
        code: card.querySelector("pre").textContent,
      }
    })()`)
    check(
      "create, code: the post appears in the feed with both files",
      codePosted && postedCode?.tabs === "app.js index.html" && postedCode.code === "const greeting = 'hi'",
      JSON.stringify(postedCode),
    )

```

- [ ] **Step 2: Run the phone check to see it fail**

Run: `PHONE_CHECK`
Expected:
- "phones get the plain code box" passes, because the old box has the same id.
- `FAIL` for "the box leaves autocorrect, capitals and spelling alone", the preview and Add file's height.
- Then the run ends early with `FAIL the check stopped early -- no element matches main input#file-name`.
- Every check before `[writing code]` passes.

- [ ] **Step 3: Write the files editor and use it in Create**

`components/code-files-editor.tsx`:

```tsx
"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { HighlightedCode } from "@/components/highlighted-code"
import { LANGUAGES, MAX_FILES, MAX_FILE_NAME, guessLanguage, languageLabel, type CodeFile } from "@/lib/code-files"
import { cn } from "@/lib/utils"

// A file being written. Its key stays the same through renames.
export interface DraftFile extends CodeFile {
  key: number
}

let lastKey = 0
export function newDraftFile(language = "javascript"): DraftFile {
  lastKey += 1
  return { key: lastKey, name: "", language, code: "" }
}

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
}

// Create's Code tab: up to 5 files as tabs, each with a name, a language
// (guessed from the name, or picked) and its code.
export function CodeFilesEditor({ files, onChange }: CodeFilesEditorProps) {
  const [active, setActive] = useState(0)
  const current = Math.min(active, files.length - 1)
  const file = files[current]

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
  const remove = () => {
    onChange(files.filter((_, index) => index !== current))
    setActive(Math.max(0, current - 1))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div
          role="tablist"
          aria-label="Files"
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                "min-h-11 shrink-0 whitespace-nowrap rounded-md border px-3 text-sm md:min-h-9",
                index === current
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-muted-foreground hover:text-foreground",
              )}
            >
              {item.name || (files.length > 1 ? "Untitled" : languageLabel(item.language))}
            </button>
          ))}
        </div>
        <Button type="button" variant="outline" onClick={add} disabled={files.length >= MAX_FILES} className="min-h-11 shrink-0 md:min-h-9">
          <Plus className="h-4 w-4" />
          Add file
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
      <PlainCodeBox file={file} onCode={(code) => update({ code })} />
      {files.length > 1 && (
        <Button type="button" variant="ghost" onClick={remove} className="min-h-11 text-destructive md:min-h-9">
          <Trash2 className="h-4 w-4" />
          Remove {file.name || "this file"}
        </Button>
      )}
    </div>
  )
}
```

`contexts/posts-context.tsx`:
- Add `import type { CodeFile } from '@/lib/code-files';` after the `@/lib/types` import.
- In `NewPost`, replace

```ts
  code?: string;
  language?: string;
```

with

```ts
  files?: CodeFile[];
```

`components/create-post-form.tsx`:
- Replace the import `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"` with

```tsx
import { CodeFilesEditor, newDraftFile, type DraftFile } from "@/components/code-files-editor"
import { parseFiles } from "@/lib/code-files"
```

- Replace

```tsx
  const [code, setCode] = useState("")
  const [language, setLanguage] = useState("javascript")
```

with

```tsx
  const [files, setFiles] = useState<DraftFile[]>(() => [newDraftFile()])
```

- Replace

```tsx
    if (!code) return setError("Code is required for code posts")
    return publish({ caption, code, language })
```

with

```tsx
    const parsed = parseFiles(files.map(({ name, language, code }) => ({ name, language, code })))
    if ("error" in parsed) return setError(parsed.error)
    return publish({ caption, files: parsed.files })
```

- Replace the Code tab (the language picker and the old code box):

```tsx
              <TabsContent value="code" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="javascript">JavaScript</SelectItem>
                      <SelectItem value="typescript">TypeScript</SelectItem>
                      <SelectItem value="jsx">JSX/React</SelectItem>
                      <SelectItem value="html">HTML</SelectItem>
                      <SelectItem value="css">CSS</SelectItem>
                      <SelectItem value="python">Python</SelectItem>
                      <SelectItem value="java">Java</SelectItem>
                      <SelectItem value="csharp">C#</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <Textarea
                    id="code"
                    placeholder="Paste your code here..."
                    className="min-h-[200px] font-mono"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required={activeTab === "code"}
                  />
                </div>
              </TabsContent>
```

with

```tsx
              <TabsContent value="code" className="mt-4 space-y-4">
                <CodeFilesEditor files={files} onChange={setFiles} />
              </TabsContent>
```

- [ ] **Step 4: Run everything to see it pass**

Run: `npm run typecheck && npm run lint && npm run test:unit`, then `PHONE_CHECK`.

Expected:
- Typecheck and lint are clean, and the unit run shows `pass 43`.
- The phone check ends with `0 failed`, including every `[writing code]` check and "small phone, create: has a row of 4 tabs".

- [ ] **Step 5: Commit**

```bash
git add components/code-files-editor.tsx components/create-post-form.tsx contexts/posts-context.tsx scripts/mobile-check.mjs
git commit -m "Write code posts with several files, and a live preview under the code box" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU"
```

---

### Task 6: Monaco on computers, docs, and the full run

**Files:**
- Create: `hooks/use-media-query.ts`, `components/monaco-input.tsx`
- Modify: `components/code-files-editor.tsx`, `scripts/mobile-check.mjs`, `package.json`, `package-lock.json`, `README.md`

**Interfaces:**
- Consumes: `CodeFilesEditor`, `PlainCodeBox`, `DraftFile` (Task 5); `languageById` (Task 1); and from the phone check, `openCodeTab`, `addFile`, `selectTab` and `postButton` (Task 5).
- Produces:
  - `useMediaQuery(query: string): boolean`.
  - `MonacoInput` (default export) with props `{ path, language, value, onChange, onFail, loading }`.
  - `EDITOR_FAILED`.

- [ ] **Step 1: Add the dependencies**

```bash
npm install --save-dev --save-exact monaco-editor@0.55.1
npm install --save-exact @monaco-editor/react@4.7.0
```

Expected:
- `package.json` has `"@monaco-editor/react": "4.7.0"` in `dependencies` and `"monaco-editor": "0.55.1"` in `devDependencies`.
- `npm ls monaco-editor` shows only `0.55.1`.

- [ ] **Step 2: Write the failing desktop checks**

In `scripts/mobile-check.mjs`, at the end of the `[desktop]` section, replace

```js
      JSON.stringify(desktopDevbits),
    )
  } catch (error) {
```

with

```js
      JSON.stringify(desktopDevbits),
    )

    console.log("\n[desktop code editor]")
    await openCodeTab(page)
    check("desktop, create: the Code tab loads Monaco", await page.waitFor(`Boolean(document.querySelector("main .monaco-editor .view-lines"))`, { timeout: 30000 }))
    check("desktop, create: instead of the plain box", !(await page.evaluate(`Boolean(document.querySelector("main textarea#code"))`)))
    // Monaco draws spaces as no-break spaces. In Chrome it takes typing
    // through an EditContext element; its textarea ignores typing.
    const monacoText = `document.querySelector("main .monaco-editor .view-lines")?.textContent.replace(/\\u00a0/g, " ")`
    const typeInMonaco = async (text) => {
      await page.type("main .monaco-editor .native-edit-context", text)
      return page.waitFor(`${monacoText} === ${JSON.stringify(text)}`, { timeout: 5000 })
    }
    check("desktop, create: typing goes into Monaco", await typeInMonaco("let first = 1"))
    await page.evaluate(click(addFile))
    check("desktop, create: a new file starts empty", await page.waitFor(`${monacoText} === ""`, { timeout: 5000 }))
    await page.type("main input#file-name", "second.js")
    check("desktop, create: typing goes into the new file", await typeInMonaco("let second = 2"))
    await page.evaluate(selectTab("Untitled"))
    check("desktop, create: going back shows the first file's own code", await page.waitFor(`${monacoText} === "let first = 1"`, { timeout: 5000 }))
    await page.type("main input#file-name", "first.js")
    const monacoCaption = `monaco ${run}`
    await page.type("#caption", monacoCaption)
    await page.evaluate(click(postButton))
    const monacoPosted = await page.waitFor(`location.pathname === "/"`, { timeout: 15000 })
    await sleep(800)
    const monacoPost = await page.evaluate(`(async () => {
      const card = [...document.querySelectorAll("main [data-post]")].find((el) => el.textContent.includes(${JSON.stringify(monacoCaption)}))
      if (!card) return null
      const tabs = [...card.querySelectorAll("[data-file-tab]")]
      const codes = []
      for (const tab of tabs) {
        tab.click()
        await new Promise((resolve) => setTimeout(resolve, 100))
        codes.push(card.querySelector("pre").textContent)
      }
      return { names: tabs.map((tab) => tab.textContent.trim()), codes }
    })()`)
    check(
      "desktop, create: each file posts with its own code",
      monacoPosted && JSON.stringify(monacoPost) === JSON.stringify({ names: ["first.js", "second.js"], codes: ["let first = 1", "let second = 2"] }),
      JSON.stringify(monacoPost),
    )
    // With jsDelivr blocked, Monaco can't load: the plain box takes over and says so.
    const blocked = await browser.newPage(DESKTOP)
    await blocked.cdp("Network.enable")
    await blocked.cdp("Network.setBlockedURLs", { urls: ["*cdn.jsdelivr.net*"] })
    await openCodeTab(blocked)
    check(
      "desktop, create: when Monaco can't load, the plain box says so",
      await blocked.waitFor(
        `document.querySelector("main").textContent.includes("The full editor couldn't load — you can still write here.") && Boolean(document.querySelector("main textarea#code"))`,
        { timeout: 15000 },
      ),
    )
    await blocked.close()
  } catch (error) {
```

- [ ] **Step 3: Run the phone check to see it fail**

Run: `PHONE_CHECK`
Expected: `FAIL desktop, create: the Code tab loads Monaco` and `FAIL desktop, create: instead of the plain box`, then `FAIL the check stopped early -- no element matches main .monaco-editor .native-edit-context`. Every check before `[desktop code editor]` passes.

- [ ] **Step 4: Load Monaco on computers**

`hooks/use-media-query.ts`:

```ts
"use client"

import { useCallback, useSyncExternalStore } from "react"

// Whether a CSS media query matches. False while rendering on the server,
// then the browser's answer, kept up to date.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
```

`components/monaco-input.tsx`:

```tsx
"use client"

import { useEffect, useRef, type ReactNode } from "react"
import Editor, { loader } from "@monaco-editor/react"
import { languageById } from "@/lib/code-files"

// Monaco's own files come from jsDelivr, pinned to the version whose types
// are installed (monaco-editor in devDependencies).
loader.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs" } })

// How long Monaco gets to appear before the plain box takes over.
const LOAD_TIMEOUT_MS = 10_000

interface MonacoInputProps {
  // One model per file, so each keeps its own code and undo history.
  path: string
  language: string
  value: string
  onChange: (value: string) => void
  // Monaco didn't load, or took more than 10 seconds.
  onFail: () => void
  loading: ReactNode
}

// VS Code's editor, for computers. Loaded only when Create's Code tab opens
// on one.
export default function MonacoInput({ path, language, value, onChange, onFail, loading }: MonacoInputProps) {
  const ready = useRef(false)

  useEffect(() => {
    const init = loader.init()
    init.catch((error: { type?: string } | undefined) => {
      if (error?.type !== "cancelation") onFail()
    })
    const timer = window.setTimeout(() => {
      if (!ready.current) onFail()
    }, LOAD_TIMEOUT_MS)
    return () => {
      window.clearTimeout(timer)
      init.cancel()
    }
  }, [onFail])

  return (
    <div className="overflow-hidden rounded-md border">
      <Editor
        height="320px"
        theme="vs-dark"
        path={path}
        language={languageById(language)?.monaco ?? "plaintext"}
        value={value}
        onChange={(next) => onChange(next ?? "")}
        onMount={() => {
          ready.current = true
        }}
        loading={loading}
        options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }}
      />
    </div>
  )
}
```

`components/code-files-editor.tsx`:
- Replace the imports

```tsx
import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
```

with

```tsx
import dynamic from "next/dynamic"
import { useCallback, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { useMediaQuery } from "@/hooks/use-media-query"
```

- After the `newDraftFile` function, add:

```tsx
export const EDITOR_FAILED = "The full editor couldn't load — you can still write here."
// A mouse or trackpad, and a screen at least 768px wide: Monaco doesn't work
// in phone browsers.
const COMPUTER = "(pointer: fine) and (min-width: 768px)"

const editorLoading = (
  <div className="flex h-80 items-center justify-center rounded-md border bg-zinc-950 text-sm text-zinc-400">Loading editor…</div>
)

// Monaco's code, and Monaco itself from jsDelivr, load only when a computer
// opens the Code tab.
const MonacoInput = dynamic(() => import("@/components/monaco-input"), { ssr: false, loading: () => editorLoading })
```

- In `CodeFilesEditor`, after `const file = files[current]`, add:

```tsx
  const computer = useMediaQuery(COMPUTER)
  const [monacoFailed, setMonacoFailed] = useState(false)
  const onMonacoFail = useCallback(() => setMonacoFailed(true), [])
```

- Replace `      <PlainCodeBox file={file} onCode={(code) => update({ code })} />` with

```tsx
      {computer && !monacoFailed ? (
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
```

- [ ] **Step 5: Run everything to see it pass**

Run: `npm run typecheck && npm run lint && npm run test:unit`, then `PHONE_CHECK`.

Expected:
- Typecheck and lint are clean, and the unit run shows `pass 43`.
- The phone check ends with `0 failed`, including every `[desktop code editor]` check and the phone-size `[writing code]` checks, which still get the plain box.

- [ ] **Step 6: Document code posts**

`README.md`:

1. Replace `- Feed of photo, video and syntax-highlighted code posts; photos and videos upload from your device (or paste a link)` with

```markdown
- Feed of photo, video and code posts; photos and videos upload from your device (or paste a link)
- Code posts with up to 5 files in 26 languages: line numbers, Copy, and Run for HTML and JavaScript in a locked-down sandbox; written in Monaco (VS Code's editor) on computers
```

2. Replace `- Vercel Blob for photos, Mux for videos` with

```markdown
- Vercel Blob for photos, Mux for videos
- Prism for code highlighting; Monaco (`@monaco-editor/react`) for writing code on computers
```

3. Replace the unit-test row of the Scripts table

```markdown
| `npm run test:unit` | unit tests for the upload rules and for photo and video deletes |
```

with

```markdown
| `npm run test:unit` | unit tests for the upload rules, code posts (file rules, highlighting, Run) and photo and video deletes |
```

4. Replace `tab rows, long names and links, and safe areas.` with `tab rows, long names and links, code posts (tabs, Copy, Run and its 5-second stop, writing them on a phone), and safe areas; at desktop size it checks that Monaco loads and that the plain box takes over when it can't.`

5. Insert before `## Folder structure`:

```markdown
## Code posts

A code post holds up to 5 files (`files: [{ name, language, code }]`), each up to 20,000 characters, in one of the 26 languages listed in `lib/code-files.ts`. A post's `language` is its first file's, which similar posts match on. Posts made before files keep `code` and `language` and show as one file, and `POST /api/posts` still accepts that form.

- **Writing:** computers (a mouse or trackpad, and a screen at least 768px wide) get Monaco, loaded from jsDelivr (`monaco-editor@0.55.1`). Phones get a plain box with a highlighted preview, and so does a computer where Monaco doesn't load within 10 seconds.
- **Run:** a post with an HTML file shows a live preview, with the post's CSS and JavaScript added. A JavaScript-only post shows its console output. The code runs in an iframe with `sandbox="allow-scripts"` and nothing else, so it can't reach Devgram's storage, cookies or sign-in. A JavaScript-only run happens in a worker inside that frame, which is removed after 5 seconds, so an endless loop can't freeze the page. A preview whose own script never stops can still freeze a browser that runs sandboxed frames in the page's own process.

```

6. In the API overview, replace

```
POST   /api/posts                 🔒 Create a post (kind "devbit" for a DevBit)
```

with

```
POST   /api/posts                 🔒 Create a post (files for code, kind "devbit" for a DevBit)
```

- [ ] **Step 7: The full run**

```bash
lsof -ti tcp:3210 -sTCP:LISTEN | xargs kill
npm run build
npx next dev --turbopack -p 3210 > "${TMPDIR:-/tmp}/devgram-dev.log" 2>&1 &
curl -s -o /dev/null --retry 90 --retry-connrefused --retry-delay 1 -m 60 http://localhost:3210/api/health
npm run typecheck && npm run lint && npm run test:unit
env SMOKE_BASE_URL=http://localhost:3210 npm run smoke
env SMOKE_BASE_URL=http://localhost:3210 npm run mobile-check
node --env-file=.env.local --input-type=module -e 'import Mux from "@mux/mux-node"; let n = 0; for await (const a of new Mux().video.assets.list({ limit: 100 })) n++; console.log("mux assets:", n)'
```

Expected:
- **Build:** succeeds. The production build compiles the Monaco chunk and the Prism grammars.
- **Unit:** `pass 43`.
- **Smoke:** every section ends with `0 failed`; the code section is included.
- **Phone check:** ends with `0 failed`, uploads included.
- **Mux:** `mux assets: 0`.

- [ ] **Step 8: Commit**

```bash
git add hooks/use-media-query.ts components/monaco-input.tsx components/code-files-editor.tsx scripts/mobile-check.mjs package.json package-lock.json README.md
git commit -m "Write code in Monaco on computers, falling back to the plain box; document code posts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E8dSeUazoj2vWixFBE67aU"
```
