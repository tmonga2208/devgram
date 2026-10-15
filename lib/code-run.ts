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
    // Errors, and anything shaped like one: the DOMException the sandbox
    // throws for localStorage, say, which would otherwise print as {}.
    const named = typeof value === "object" && value !== null && typeof value.name === "string" && typeof value.message === "string"
    if (named || Object.prototype.toString.call(value) === "[object Error]") {
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
