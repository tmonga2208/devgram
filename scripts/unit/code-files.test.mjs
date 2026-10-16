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

const file = (name, language, code) => ({ name, language, code })

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
    "config.yml": "yaml", "notes.txt": "text", "README.md": "markdown", "util.h": "c", "  spaced.go  ": "go",
  }
  for (const [name, id] of Object.entries(cases)) assert.equal(guessLanguage(name), id, name)
  for (const name of ["", "notes", "archive.", "Makefile"]) assert.equal(guessLanguage(name), null, name)
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
