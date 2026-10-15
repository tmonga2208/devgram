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
