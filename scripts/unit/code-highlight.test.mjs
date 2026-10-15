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
