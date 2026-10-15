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
