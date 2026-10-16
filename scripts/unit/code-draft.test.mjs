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
