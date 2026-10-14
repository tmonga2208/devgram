// A small Chrome DevTools Protocol client: opens pages at a chosen screen
// size in headless Chrome, runs JavaScript in them and takes screenshots.
// No dependencies. Needs Chrome or Chromium installed; CHROME_PATH overrides
// the usual locations.
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function launchBrowser() {
  const executable = CANDIDATES.find((candidate) => existsSync(candidate))
  if (!executable) throw new Error("Chrome was not found. Set CHROME_PATH to a Chrome or Chromium binary.")

  const profile = await mkdtemp(path.join(tmpdir(), "devgram-chrome-"))
  const chrome = spawn(
    executable,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" },
  )

  // Chrome writes the port it chose, and its browser endpoint, to this file.
  const portFile = path.join(profile, "DevToolsActivePort")
  let endpoint = null
  for (let attempt = 0; attempt < 150 && !endpoint; attempt++) {
    await sleep(100)
    const lines = existsSync(portFile) ? (await readFile(portFile, "utf8")).trim().split("\n") : []
    if (lines.length === 2) endpoint = `ws://127.0.0.1:${lines[0]}${lines[1]}`
  }
  if (!endpoint) {
    chrome.kill()
    throw new Error("Chrome did not start in time.")
  }

  const socket = new WebSocket(endpoint)
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true })
    socket.addEventListener("error", () => reject(new Error("Could not connect to Chrome.")), { once: true })
  })

  let lastId = 0
  const pending = new Map()
  const listeners = new Set()
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data)
    if (message.id === undefined) {
      for (const listener of listeners) listener(message)
      return
    }
    const call = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) call.reject(new Error(`${call.method}: ${message.error.message}`))
    else call.resolve(message.result)
  })

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++lastId
      pending.set(id, { resolve, reject, method })
      socket.send(JSON.stringify({ id, method, params, sessionId }))
    })

  async function newPage({ width, height, mobile = true }) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" })
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
    const cdp = (method, params) => send(method, params, sessionId)

    const lifecycle = []
    listeners.add((message) => {
      if (message.sessionId === sessionId && message.method === "Page.lifecycleEvent") lifecycle.push(message.params)
    })

    await cdp("Page.enable")
    await cdp("Runtime.enable")
    await cdp("Page.setLifecycleEventsEnabled", { enabled: true })

    const page = {
      cdp,

      async setViewport(size) {
        const isMobile = size.mobile ?? mobile
        await cdp("Emulation.setDeviceMetricsOverride", {
          width: size.width,
          height: size.height,
          deviceScaleFactor: isMobile ? 2 : 1,
          mobile: isMobile,
        })
        await cdp("Emulation.setTouchEmulationEnabled", { enabled: isMobile })
      },

      // Loads the address and waits until the network has gone quiet.
      async goto(url, { timeout = 60000 } = {}) {
        const { loaderId, errorText } = await cdp("Page.navigate", { url })
        if (errorText) throw new Error(`${url}: ${errorText}`)
        const deadline = Date.now() + timeout
        while (!lifecycle.some((event) => event.loaderId === loaderId && event.name === "networkIdle")) {
          if (Date.now() > deadline) throw new Error(`${url} did not finish loading within ${timeout}ms`)
          await sleep(50)
        }
      },

      // Runs an expression in the page and returns its JSON-serialisable value.
      async evaluate(expression) {
        const { result, exceptionDetails } = await cdp("Runtime.evaluate", {
          expression,
          returnByValue: true,
          awaitPromise: true,
        })
        if (exceptionDetails) {
          throw new Error(exceptionDetails.exception?.description || exceptionDetails.text)
        }
        return result.value
      },

      // Waits until the expression is truthy in the page; returns whether it got there.
      async waitFor(expression, { timeout = 15000 } = {}) {
        const deadline = Date.now() + timeout
        while (Date.now() < deadline) {
          if (await page.evaluate(`Boolean(${expression})`).catch(() => false)) return true
          await sleep(100)
        }
        return false
      },

      // Puts files into a file input, as if the person had chosen them.
      async setInputFiles(selector, files) {
        const { root } = await cdp("DOM.getDocument", { depth: 0 })
        const { nodeId } = await cdp("DOM.querySelector", { nodeId: root.nodeId, selector })
        if (!nodeId) throw new Error(`no element matches ${selector}`)
        await cdp("DOM.setFileInputFiles", { nodeId, files })
      },

      // Focuses the element and types into it the way a keyboard would.
      async type(selector, text) {
        const focused = await page.evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)})
          if (!el) return false
          el.focus()
          return true
        })()`)
        if (!focused) throw new Error(`no element matches ${selector}`)
        await cdp("Input.insertText", { text })
      },

      async screenshot(file) {
        const { data } = await cdp("Page.captureScreenshot", { format: "png" })
        await writeFile(file, Buffer.from(data, "base64"))
      },

      async close() {
        await send("Target.closeTarget", { targetId })
      },
    }

    await page.setViewport({ width, height })
    return page
  }

  async function close() {
    await send("Browser.close").catch(() => undefined)
    socket.close()
    chrome.kill()
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined)
  }

  return { newPage, close }
}
