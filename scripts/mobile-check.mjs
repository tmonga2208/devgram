// Phone-width layout check. Opens every page in headless Chrome at phone
// size, signed in as a throwaway account, and measures the layout.
// Needs the app running, MONGODB_URI in .env.local and Chrome installed.
// Usage: npm run mobile-check
// SMOKE_BASE_URL and SMOKE_DB work as in the smoke test. MOBILE_SHOTS names a
// directory to save a screenshot of each page into.
import { execFileSync } from "node:child_process"
import { mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { launchBrowser } from "./lib/browser.mjs"
import { GITHUB_FIXTURE, assertSameDatabase, insertGitHubPost, insertLegacyCodePost, removeTestUsers } from "./lib/test-users.mjs"

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000"
const SHOTS = process.env.MOBILE_SHOTS
const PHONE = { width: 390, height: 844 }
const SMALL_PHONE = { width: 320, height: 568 }
const DESKTOP = { width: 1280, height: 800, mobile: false }
const GUTTER = 16
const TAP_TARGET = 44
// The checks that call GitHub (the picker) need the app's GitHub keys.
const GITHUB_KEYS = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
const buttonHeight = (text) => `(() => {
  const button = [...document.querySelectorAll("main button")].find((b) => b.textContent.includes(${JSON.stringify(text)}))
  return button ? button.getBoundingClientRect().height : 0
})()`

const run = Math.random().toString(36).slice(2, 8)
// The longest usernames the app allows, and a link too long for one line:
// both have to wrap or be trimmed instead of widening the page.
const names = { a: `mobile_${run}_a_with_long_name`, b: `mobile_${run}_b_with_long_name` }
const LONG_LINK = `https://example.com/${"longpath".repeat(15)}${run}`
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
let checks = 0
let failures = 0

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function check(name, condition, detail = "") {
  checks++
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ""}`)
  }
}

async function api(method, route, token, body) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${method} ${route} answered ${res.status}`)
  return data
}

// Uploads the 2-second test clip for that account, waits until Mux has it
// ready, and posts it with the given fields. Returns the new post's id.
async function postClip(session, fields) {
  const { uploadId, url } = await api("POST", "/api/uploads/video", session.token)
  const put = await fetch(url, { method: "PUT", body: await readFile(fixture("clip-2s.mp4")) })
  if (!put.ok) throw new Error(`upload to Mux answered ${put.status}`)
  for (let attempt = 0; attempt < 60; attempt++) {
    const { status } = await api("GET", `/api/uploads/video/${uploadId}`, session.token)
    if (status === "ready") break
    if (status === "failed") throw new Error("Mux could not process the test clip")
    await sleep(2000)
  }
  return (await api("POST", "/api/posts", session.token, { ...fields, videoUploadId: uploadId }))._id
}

// Two accounts with enough content to fill every page: posts of each kind, a
// follow, a like, a comment and a conversation.
async function seed() {
  const users = {}
  for (const key of ["a", "b"]) {
    users[key] = await api("POST", "/api/auth/register", null, {
      username: names[key],
      email: `${names[key]}@example.com`,
      password: "mobile-pass-1",
      fullName: `Mobile ${key.toUpperCase()}`,
    })
  }
  const { a, b } = users
  const image = `${BASE}/icons/icon-512.png`
  await api("POST", "/api/posts", b.token, { caption: `image post ${run}`, image })
  // One unbroken line far wider than a phone: it has to scroll inside its block.
  const code = await api("POST", "/api/posts", a.token, {
    caption: `wide code ${run}`,
    code: `const wide = "${"x".repeat(300)}"`,
    language: "javascript",
  })
  await api("POST", "/api/posts", a.token, {
    caption: `${"A long caption made of ordinary words. ".repeat(10)}${LONG_LINK}`,
    image,
  })
  await api("PATCH", "/api/users/profile", a.token, { website: LONG_LINK, bio: `Bio with a link: ${LONG_LINK}` })
  await api("POST", `/api/users/${names.a}/follow`, b.token)
  await api("POST", `/api/posts/${code._id}/like`, b.token)
  await api("POST", `/api/posts/${code._id}/comments`, b.token, { text: `a comment with a link ${LONG_LINK}` })
  for (const content of ["hello there", "how does this look on a phone?", LONG_LINK]) {
    await api("POST", "/api/messages", b.token, { receiver: names.a, content })
  }
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
    // Two files that share a name, one log now and one a moment later.
    script: await codePost("script", [
      { name: "greet.js", language: "javascript", code: 'const who = "a worker"' },
      { name: "main.js", language: "javascript", code: 'console.log("hello from " + who)\nsetTimeout(() => console.log("a moment later"), 300)' },
    ]),
    loop: await codePost("endless loop", [{ name: "loop.js", language: "javascript", code: "let i = 0\nwhile (true) { i++ }" }]),
    flood: await codePost("endless logging", [{ name: "flood.js", language: "javascript", code: "let i = 0\nwhile (true) console.log(i++)" }]),
    // Code that calls postMessage itself, as fast as it can, with messages
    // shaped like real output so each one would reach the panel.
    workerFlood: await codePost("worker flood", [
      { name: "post.js", language: "javascript", code: 'const lines = [{ level: "log", text: "x" }]\nwhile (true) postMessage({ devgramRun: "lines", lines })' },
    ]),
    // A page has no time limit. (A page stuck in while (true) never gets its
    // messages sent at all; this one sends them in bursts.)
    pageFlood: await codePost("page flood", [
      {
        name: "index.html",
        language: "html",
        code: '<script>const lines = [{ level: "log", text: "x" }]\nconst burst = () => { for (let i = 0; i < 2000; i++) parent.postMessage({ devgramRun: "lines", lines }, "*"); setTimeout(burst) }\nburst()</script>',
      },
    ]),
  }

  // A file from GitHub with lines 80–85 marked. With the app's GitHub keys it
  // is posted the way people post one; without them it is stored straight in
  // the database, with the same file from git, so the code view's checks run
  // either way.
  const githubFile = {
    name: "code-files.ts",
    language: "typescript",
    github: { ...GITHUB_FIXTURE, path: "lib/code-files.ts" },
    marked: { from: 80, to: 85 },
  }
  const githubPostId = GITHUB_KEYS
    ? (await api("POST", "/api/posts", a.token, { caption: `github file ${run}`, files: [githubFile] }))._id
    : await insertGitHubPost(names.a, {
        caption: `github file ${run}`,
        file: { ...githubFile, code: execFileSync("git", ["show", `${GITHUB_FIXTURE.commit}:lib/code-files.ts`], { encoding: "utf8" }) },
      })

  // Mux videos for the playback checks: a video post, and three DevBits.
  let videoPostId = null
  let devbits = null
  if (process.env.MUX_TOKEN_ID) {
    const [video, one, two, three] = await Promise.all([
      postClip(a, { caption: `vertical video ${run}` }),
      postClip(a, { caption: `devbit one ${run}`, kind: "devbit" }),
      postClip(b, { caption: `devbit two ${run}`, kind: "devbit" }),
      postClip(a, { caption: `devbit three ${run}`, kind: "devbit" }),
    ])
    videoPostId = video
    devbits = { one, two, three }
  }
  return { a, b, postId: code._id, videoPostId, devbits, codePosts, githubPostId }
}

// Everything below this point runs inside the page.
const HELPERS = `
  const visible = (el) => {
    if (!el) return false
    const box = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none"
  }
  const rect = (el) => {
    const box = el.getBoundingClientRect()
    return { top: box.top, left: box.left, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
  }
  const tabBar = [...document.querySelectorAll('nav[aria-label="Primary"]')].find(visible) || null
`

const SHELL = `(() => {
  ${HELPERS}
  const header = document.querySelector("header")
  const main = document.querySelector("main")
  const content = main && main.firstElementChild
  return {
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    header: header ? rect(header) : null,
    headerPaddingTop: header ? parseFloat(getComputedStyle(header).paddingTop) : null,
    content: content ? rect(content) : null,
    tabBar: tabBar && {
      ...rect(tabBar),
      position: getComputedStyle(tabBar).position,
      paddingBottom: parseFloat(getComputedStyle(tabBar).paddingBottom),
      links: [...tabBar.querySelectorAll("a")].map((link) => ({
        label: link.textContent.trim(),
        href: link.getAttribute("href"),
        current: link.getAttribute("aria-current") === "page",
        ...rect(link),
      })),
    },
    back: visible(document.querySelector('header button[aria-label="Back"]')),
    menuButton: [...document.querySelectorAll("header button")].some(
      (button) => visible(button) && /toggle menu/i.test(button.textContent),
    ),
    search: visible(document.querySelector("header input")),
    headerLinks: [...document.querySelectorAll("header a")].filter(visible).map((link) => link.getAttribute("href")),
    sidebar: [...document.querySelectorAll("a")].some(
      (link) => visible(link) && link.getAttribute("href") === "/settings" && !link.closest("main"),
    ),
    viewportMeta: document.querySelector('meta[name="viewport"]')?.content || "",
    toastsBottom: parseFloat(getComputedStyle(document.querySelector("#_rht_toaster")).bottom),
  }
})()`

// Scrolls to the end of the page and reports where the content stops.
const PAGE_END = `(() => {
  ${HELPERS}
  window.scrollTo(0, document.documentElement.scrollHeight)
  const main = document.querySelector("main")
  const last = main && main.lastElementChild
  return {
    contentBottom: last ? last.getBoundingClientRect().bottom : null,
    tabBarTop: tabBar ? tabBar.getBoundingClientRect().top : innerHeight,
  }
})()`

const TAB_ROWS = `(() => {
  ${HELPERS}
  return [...document.querySelectorAll('main [role="tablist"]')].map((list) => ({
    scrolls: ["auto", "scroll"].includes(getComputedStyle(list).overflowX),
    overflows: list.scrollWidth > list.clientWidth + 1,
    tabs: [...list.querySelectorAll('[role="tab"]')].map((tab) => ({
      label: tab.textContent.trim(),
      clipped: tab.scrollWidth > tab.clientWidth + 1,
      ...rect(tab),
    })),
  }))
})()`

// The DevBits screen: the list, and each DevBit in it with its video's state.
const DEVBITS_STATE = `(() => {
  ${HELPERS}
  const list = document.querySelector("[data-devbits-list]")
  const slides = list ? [...list.querySelectorAll("[data-devbit]")] : []
  return {
    list: list ? rect(list) : null,
    scrollTop: list ? list.scrollTop : null,
    slides: slides.map((slide) => {
      const video = slide.querySelector("mux-video")
      return {
        id: slide.getAttribute("data-devbit"),
        author: slide.getAttribute("data-author"),
        player: Boolean(video),
        thumbnail: Boolean(slide.querySelector('img[src^="https://image.mux.com/"]')),
        height: rect(slide).height,
        playing: Boolean(video && !video.paused),
        muted: Boolean(video && video.muted),
        preload: video ? video.preload : null,
      }
    }),
  }
})()`

const messagesState = (otherUser) => `(() => {
  ${HELPERS}
  const conversation = [...document.querySelectorAll("main button")].find(
    (button) => visible(button) && button.textContent.includes(${JSON.stringify(otherUser)}),
  )
  const composer = [...document.querySelectorAll('main input[placeholder="Type a message..."]')].find(visible)
  const form = composer && composer.closest("form")
  return {
    search: location.search,
    conversation: conversation ? rect(conversation) : null,
    conversationName: conversation ? rect(conversation.querySelector("p")) : null,
    conversationTime: conversation ? rect(conversation.lastElementChild) : null,
    composer: composer ? rect(composer) : null,
    composerBottom: form ? form.parentElement.getBoundingClientRect().bottom : null,
    tabBarTop: tabBar ? tabBar.getBoundingClientRect().top : innerHeight,
    // The oldest message: unlike the newest, the list never previews it.
    threadText: [...document.querySelectorAll("main p")].some((p) => visible(p) && p.textContent === "hello there"),
  }
})()`

// Where the pieces of text containing the needle sit. Text that is clipped
// by its box still counts as outside it.
const textPlacement = (needle) => `(() => {
  const walker = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let found = 0
  let outside = 0
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.includes(${JSON.stringify(needle)})) continue
    range.selectNodeContents(node)
    const boxes = [...range.getClientRects()]
    if (boxes.length === 0) continue
    found++
    if (boxes.some((box) => box.left < ${GUTTER} - 0.5 || box.right > innerWidth - ${GUTTER} + 0.5)) outside++
  }
  return { found, outside }
})()`

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

const click = (selectorExpression) => `(() => {
  const el = ${selectorExpression}
  if (!el) return false
  el.click()
  return true
})()`

// A page wider than the screen either scrolls sideways or makes the browser
// zoom out, which shows up as a wider window than the device.
const fitsScreen = (m, device) => m.width === device.width && m.scrollWidth <= device.width
const widthDetail = (m, device) =>
  `page is ${m.scrollWidth}px wide and shown ${m.width}px wide on a ${device.width}px screen`

let shotNumber = 0
async function shot(page, label) {
  if (!SHOTS) return
  shotNumber++
  await page.screenshot(path.join(SHOTS, `${String(shotNumber).padStart(2, "0")}-${label}.png`))
}

async function open(page, route) {
  await page.goto(`${BASE}${route}`)
  await page.waitFor(`document.querySelector("main") && !document.querySelector(".animate-pulse")`)
  await sleep(300)
}

async function signIn(page, session) {
  await page.goto(`${BASE}/login`)
  await page.evaluate(`(() => {
    localStorage.setItem("token", ${JSON.stringify(session.token)})
    localStorage.setItem("user", ${JSON.stringify(JSON.stringify(session.user))})
    document.cookie = "token=" + ${JSON.stringify(session.token)} + "; path=/; SameSite=Lax"
  })()`)
}

// The checks every page of the phone layout has to pass.
async function shellChecks(page, label, { back, tabs, current = null, fill = false }) {
  const m = await page.evaluate(SHELL)
  await shot(page, label)

  check(`${label}: fits the width of the screen`, fitsScreen(m, PHONE), widthDetail(m, PHONE))
  if (!fill) {
    check(
      `${label}: content keeps a ${GUTTER}px margin on both sides`,
      m.content && m.content.left >= GUTTER - 0.5 && m.content.right <= m.width - GUTTER + 0.5,
      m.content ? `content spans ${m.content.left}px to ${m.content.right}px of ${m.width}px` : "no content",
    )
  }
  const gap = m.content && m.header ? Math.round(m.content.top - m.header.bottom) : null
  check(`${label}: content starts right under the top bar`, gap !== null && gap <= 24, `gap of ${gap}px`)

  const bar = m.tabBar
  check(
    `${label}: a tab bar is fixed to the bottom of the screen`,
    bar && bar.position === "fixed" && Math.abs(bar.bottom - m.height) <= 0.5 && bar.left === 0 && bar.width === m.width,
    bar ? `position ${bar.position}, bottom at ${bar.bottom}px of ${m.height}px` : "no tab bar",
  )
  check(
    `${label}: its tabs are Home, Explore, Create, DevBits, Profile`,
    bar && bar.links.map((link) => `${link.label}=${link.href}`).join(" ") === tabs,
    bar ? bar.links.map((link) => `${link.label}=${link.href}`).join(" ") : "no tab bar",
  )
  check(
    `${label}: every tab is at least ${TAP_TARGET}px tall and wide`,
    bar && bar.links.length > 0 && bar.links.every((link) => link.width >= TAP_TARGET && link.height >= TAP_TARGET),
  )
  if (current) {
    check(
      `${label}: only the ${current} tab is marked as the current page`,
      bar && bar.links.filter((link) => link.current).map((link) => link.label).join() === current,
    )
  } else {
    check(`${label}: no tab is marked as the current page`, bar && bar.links.every((link) => !link.current))
  }
  check(`${label}: no hamburger menu`, !m.menuButton)
  check(
    `${label}: top bar has search, notifications and messages`,
    m.search && m.headerLinks.includes("/notifications") && m.headerLinks.includes("/direct"),
    `search ${m.search}, links ${m.headerLinks.join(" ") || "none"}`,
  )
  check(`${label}: back arrow is ${back ? "shown" : "not shown"}`, m.back === back)

  const end = await page.evaluate(PAGE_END)
  check(
    `${label}: the end of the page is not hidden behind the tab bar`,
    bar && end.contentBottom !== null && end.contentBottom <= end.tabBarTop + 0.5,
    `content ends at ${end.contentBottom}px, tab bar starts at ${end.tabBarTop}px`,
  )
}

// Long names and links must stay inside the page margins.
async function textChecks(page, label, texts) {
  for (const [what, needle] of Object.entries(texts)) {
    const placed = await page.evaluate(textPlacement(needle))
    check(
      `${label}: ${what} stays inside the page margins`,
      placed.found > 0 && placed.outside === 0,
      placed.found ? `${placed.outside} of ${placed.found} places stick out` : "not found on the page",
    )
  }
}

async function tabRowChecks(page, label, expected) {
  const rows = await page.evaluate(TAB_ROWS)
  const row = rows.find((candidate) => candidate.tabs.length === expected)
  check(`${label}: has a row of ${expected} tabs`, Boolean(row), `rows of ${rows.map((r) => r.tabs.length).join(", ") || "none"}`)
  if (!row) return
  const clipped = row.tabs.filter((tab) => tab.clipped).map((tab) => tab.label)
  check(`${label}: no tab label is cut off`, clipped.length === 0, `cut off: ${clipped.join(", ")}`)
  const overlapping = row.tabs.filter((tab, i) => i > 0 && tab.left < row.tabs[i - 1].right - 0.5).map((tab) => tab.label)
  check(`${label}: tabs do not overlap`, overlapping.length === 0, `overlapping: ${overlapping.join(", ")}`)
  check(`${label}: a row wider than the screen scrolls sideways`, !row.overflows || row.scrolls)
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Run through `npm run mobile-check`.")
    process.exit(2)
  }
  try {
    await assertSameDatabase(BASE)
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
  if (SHOTS) await mkdir(SHOTS, { recursive: true })

  let browser = null
  try {
    const { a, b, postId, videoPostId, devbits, codePosts, githubPostId } = await seed()
    const tabs = `Home=/ Explore=/explore Create=/create DevBits=/devbits Profile=/profile/${names.a}`
    browser = await launchBrowser()
    const page = await browser.newPage(PHONE)

    console.log("\n[signed out]")
    await open(page, "/")
    const anonymous = await page.evaluate(SHELL)
    await shot(page, "signed-out-home")
    check(
      "signed out: the Profile tab leads to the login page",
      anonymous.tabBar?.links.find((link) => link.label === "Profile")?.href === "/login",
    )
    if (devbits) {
      await open(page, `/devbits/${devbits.one}`)
      check(
        "signed out: a DevBit link opens and plays",
        await page.waitFor(`(() => { const v = document.querySelector("[data-devbit] mux-video"); return Boolean(v && !v.paused) })()`, { timeout: 30000 }),
      )
      await page.evaluate(click(`document.querySelector('[data-devbit] button[aria-label="Like"]')`))
      check("signed out: liking a DevBit asks you to log in", await page.waitFor(`location.pathname === "/login"`, { timeout: 5000 }))
    }

    await signIn(page, a)

    console.log("\n[main tabs]")
    await open(page, "/")
    await shellChecks(page, "home", { back: false, tabs, current: "Home" })
    await textChecks(page, "home", { "a long username": names.b, "a long link in a caption": LONG_LINK })
    const home = await page.evaluate(SHELL)
    check(
      "home: toasts appear above the tab bar",
      home.tabBar && home.toastsBottom >= home.tabBar.height,
      `toasts sit ${home.toastsBottom}px from the bottom, the tab bar is ${home.tabBar?.height}px tall`,
    )
    await open(page, "/explore")
    await shellChecks(page, "explore", { back: false, tabs, current: "Explore" })
    await open(page, "/create")
    await shellChecks(page, "create", { back: false, tabs, current: "Create" })
    await open(page, "/devbits")
    await shellChecks(page, "devbits", { back: false, tabs, current: "DevBits", fill: true })
    await open(page, `/profile/${names.a}`)
    await shellChecks(page, "own profile", { back: false, tabs, current: "Profile" })
    await textChecks(page, "own profile", { "a long username": names.a, "a long link in the bio": LONG_LINK })
    check(
      "own profile: links to Settings",
      await page.evaluate(`[...document.querySelectorAll('main a[href="/settings"]')].some((a) => a.getBoundingClientRect().width > 0)`),
    )

    console.log("\n[other pages]")
    await open(page, `/profile/${names.b}`)
    await shellChecks(page, "someone else's profile", { back: true, tabs })
    await open(page, `/p/${postId}`)
    await shellChecks(page, "post", { back: true, tabs })
    await textChecks(page, "post", { "a long username": names.b, "a long link in a comment": LONG_LINK })
    await open(page, `/search?q=${run}`)
    await shellChecks(page, "search results", { back: true, tabs })
    await open(page, "/notifications")
    await shellChecks(page, "notifications", { back: true, tabs })
    await textChecks(page, "notifications", { "a long username": names.b })
    const icons = await page.evaluate(
      `[...document.querySelectorAll("main div.rounded-full.h-10.w-10")].map((icon) => icon.getBoundingClientRect().width)`,
    )
    check(
      "notifications: icons keep their round shape next to a long username",
      icons.length > 0 && icons.every((width) => width === 40),
      `icon widths ${icons.join(", ")}`,
    )
    await tabRowChecks(page, "notifications", 5)
    await open(page, "/settings")
    await shellChecks(page, "settings", { back: true, tabs })
    await tabRowChecks(page, "settings", 4)
    check(
      "settings: has a Log out button",
      await page.evaluate(
        `[...document.querySelectorAll("main button")].some((b) => /log ?out/i.test(b.textContent) && b.getBoundingClientRect().width > 0)`,
      ),
    )

    console.log("\n[back arrow]")
    await open(page, "/explore")
    await page.evaluate(click(`document.querySelector('main a[href^="/p/"]')`))
    await page.waitFor(`location.pathname.startsWith("/p/")`)
    await page.evaluate(click(`document.querySelector('header button[aria-label="Back"]')`))
    check("back arrow returns to the page you came from", await page.waitFor(`location.pathname === "/explore"`, { timeout: 5000 }))
    const fresh = await browser.newPage(PHONE)
    await open(fresh, `/p/${postId}`)
    await fresh.evaluate(click(`document.querySelector('header button[aria-label="Back"]')`))
    check("back arrow goes home when there is no previous page", await fresh.waitFor(`location.pathname === "/"`, { timeout: 5000 }))
    await fresh.close()

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
    // Output goes out at most every 100 ms, so the error comes just after the log.
    await page.waitFor(`document.querySelector('main [data-run-line][data-level="error"]')`, { timeout: 5000 })
    // Chrome reports Tailwind's colours as lab(lightness a b): red is strongly
    // coloured, with a hue angle near 25 degrees.
    const errorLine = await page.evaluate(`(() => {
      const error = [...document.querySelectorAll('main [data-run-line][data-level="error"]')][0]
      if (!error) return null
      const colour = getComputedStyle(error).color
      const lab = /^lab\\(([\\d.-]+) ([\\d.-]+) ([\\d.-]+)/.exec(colour)
      return {
        text: error.textContent,
        colour,
        chroma: lab ? Math.hypot(Number(lab[2]), Number(lab[3])) : null,
        hue: lab ? ((Math.atan2(Number(lab[3]), Number(lab[2])) * 180) / Math.PI + 360) % 360 : null,
      }
    })()`)
    check(
      "three-file post: the page's errors show in red",
      errorLine?.text === "ReferenceError: nope is not defined" && errorLine.chroma > 30 && (errorLine.hue < 45 || errorLine.hue > 340),
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
    const runUntilStopped = async (label, id, { message = "Stopped after 5 seconds", after = 4.5 } = {}) => {
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
      const stopped = await page.waitFor(`${output}.includes(${JSON.stringify(message)})`, { timeout: 15000 })
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
      check(`${label}: ${message.toLowerCase()}`, stopped && seconds >= after, `${seconds.toFixed(1)}s ${JSON.stringify(state)}`)
      check(`${label}: the page kept responding`, state.lateBy < 500, `timers ran up to ${state.lateBy}ms late`)
      check(`${label}: its frame is gone and Run is back`, !state.frame && state.button === "Run", JSON.stringify(state))
      return state
    }
    await runUntilStopped("endless loop", codePosts.loop)
    const flood = await runUntilStopped("endless logging", codePosts.flood)
    check("endless logging: the panel keeps at most 200 lines", flood.lines > 1 && flood.lines <= 200, `${flood.lines} lines`)
    // Code that calls postMessage itself skips the output batching; reading
    // thousands of messages a second would freeze the page, so it's cut off.
    const tooMuch = { message: "Stopped — too much output at once", after: 0 }
    await runUntilStopped("a worker posting messages in a loop", codePosts.workerFlood, tooMuch)
    await runUntilStopped("a page posting messages in a loop", codePosts.pageFlood, tooMuch)

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

    console.log("\n[messages]")
    await open(page, "/direct")
    await shellChecks(page, "conversation list", { back: true, tabs, fill: true })
    const list = await page.evaluate(messagesState(names.b))
    check(
      "conversation list: a conversation spans the screen",
      list.conversation && list.conversation.width >= PHONE.width - 2 * GUTTER - 1,
      list.conversation ? `conversation is ${Math.round(list.conversation.width)}px wide` : "no conversation",
    )
    check("conversation list: the thread is a separate screen", !list.composer && !list.threadText)
    check(
      "conversation list: a long username is trimmed to leave room for the time",
      list.conversationName &&
        list.conversationTime &&
        list.conversationName.right <= list.conversationTime.left &&
        list.conversationTime.right <= list.conversation.right - GUTTER + 0.5,
      `name ends at ${list.conversationName?.right}px, time spans ${list.conversationTime?.left}px to ${list.conversationTime?.right}px, row ends at ${list.conversation?.right}px`,
    )

    await page.evaluate(click(`[...document.querySelectorAll("main button")].find((b) => b.textContent.includes(${JSON.stringify(names.b)}))`))
    const opened = await page.waitFor(`location.search.includes("user=")`, { timeout: 5000 })
    await sleep(600)
    check("thread: opening a conversation gives it its own address", opened)
    await shellChecks(page, "thread", { back: true, tabs, fill: true })
    const thread = await page.evaluate(messagesState(names.b))
    check("thread: shows the messages without the conversation list", thread.threadText && !thread.conversation)
    await textChecks(page, "thread", { "a long username": names.b, "a long link in a message": LONG_LINK })
    check(
      "thread: the message box spans the screen",
      thread.composer && thread.composer.left >= GUTTER - 0.5 && thread.composer.width >= PHONE.width - 2 * GUTTER - 60,
      thread.composer ? `message box is ${Math.round(thread.composer.width)}px wide` : "no message box",
    )
    check(
      "thread: the message box sits on top of the tab bar",
      thread.composerBottom !== null && Math.abs(thread.composerBottom - thread.tabBarTop) <= 0.5,
      `message box ends at ${thread.composerBottom}px, tab bar starts at ${thread.tabBarTop}px`,
    )
    await page.evaluate(click(`document.querySelector('header button[aria-label="Back"]')`))
    await page.waitFor(`!location.search.includes("user=")`, { timeout: 5000 })
    await sleep(400)
    const backToList = await page.evaluate(messagesState(names.b))
    check("thread: the back arrow returns to the conversation list", Boolean(backToList.conversation) && !backToList.composer)

    await open(page, `/direct?user=${names.b}`)
    const direct = await page.evaluate(messagesState(names.b))
    await shot(page, "thread-opened-by-link")
    check("thread: a link to a conversation opens the thread", Boolean(direct.composer) && direct.threadText && !direct.conversation)

    console.log("\n[video playback]")
    if (!videoPostId) {
      console.log("  skip video playback (MUX_TOKEN_ID is not set)")
    } else {
      await open(page, "/")
      check("home: an uploaded video shows a player", await page.waitFor(`document.querySelector("main mux-player")`, { timeout: 15000 }))
      await open(page, "/explore")
      check(
        "explore: an uploaded video shows its thumbnail",
        await page.waitFor(`[...document.querySelectorAll("main img")].some((img) => img.src.startsWith("https://image.mux.com/"))`, { timeout: 15000 }),
      )
      await open(page, `/p/${videoPostId}`)
      await page.waitFor(`document.querySelector("main mux-player")`, { timeout: 15000 })
      const player = await page.evaluate(`(() => {
        const box = document.querySelector("main mux-player")?.getBoundingClientRect()
        return box ? { width: box.width, height: box.height } : null
      })()`)
      check("post: a vertical video keeps its vertical shape", player !== null && player.height > player.width, JSON.stringify(player))
      const shell = await page.evaluate(SHELL)
      check("post: a video page fits the width of the screen", fitsScreen(shell, PHONE), widthDetail(shell, PHONE))
    }

    console.log("\n[devbits]")
    if (!devbits) {
      console.log("  skip devbits (MUX_TOKEN_ID is not set)")
    } else {
      const list = `document.querySelector("[data-devbits-list]")`
      const videos = `[...document.querySelectorAll("[data-devbit] mux-video")]`
      await open(page, `/devbits/${devbits.one}`)
      check(
        "devbits: the DevBit on screen plays, muted",
        await page.waitFor(`(() => { const v = ${videos}[0]; return Boolean(v && !v.paused && v.muted) })()`, { timeout: 30000 }),
      )
      const first = await page.evaluate(DEVBITS_STATE)
      const bars = await page.evaluate(SHELL)
      await shot(page, "devbits")
      check("devbits: the linked DevBit comes first", first.slides[0]?.id === devbits.one, first.slides.map((slide) => slide.id).join(", "))
      check(
        "devbits: one DevBit fills the space between the bars",
        Boolean(first.list && bars.header && bars.tabBar) &&
          Math.abs(first.list.top - bars.header.bottom) <= 1 &&
          Math.abs(first.list.bottom - bars.tabBar.top) <= 1 &&
          Math.abs(first.slides[0].height - first.list.height) <= 1,
        JSON.stringify({ list: first.list, headerBottom: bars.header?.bottom, tabBarTop: bars.tabBar?.top }),
      )
      check("devbits: fits the width of the screen", fitsScreen(bars, PHONE), widthDetail(bars, PHONE))
      check(
        "devbits: the next DevBit loads only its metadata ahead",
        first.slides[1]?.preload === "metadata",
        first.slides.map((slide) => slide.preload).join(", "),
      )
      check(
        "devbits: only the DevBits next to the one on screen have a player; the rest show a thumbnail",
        first.slides.length > 2 &&
          first.slides[0].player &&
          first.slides[1].player &&
          first.slides.slice(2).every((slide) => !slide.player && slide.thumbnail),
        first.slides.map((slide) => (slide.player ? "player" : slide.thumbnail ? "thumbnail" : "nothing")).join(", "),
      )

      await page.evaluate(`${list}.scrollBy({ top: ${list}.clientHeight })`)
      await sleep(1000)
      const second = await page.evaluate(DEVBITS_STATE)
      check(
        "devbits: scrolling snaps to the next DevBit",
        Boolean(second.list) && Math.abs(second.scrollTop - second.list.height) <= 1,
        `scrolled ${second.scrollTop}px of a ${second.list?.height}px screen`,
      )
      check(
        "devbits: only the DevBit on screen plays",
        await page.waitFor(`(() => { const v = ${videos}; return v.length > 1 && v[0].paused && !v[1].paused })()`, { timeout: 30000 }),
      )

      await page.evaluate(click(`document.querySelector('main button[aria-label="Turn sound on"]')`), { userGesture: true })
      check(
        "devbits: the speaker button turns sound on",
        await page.waitFor(`(() => { const v = ${videos}[1]; return Boolean(v && !v.muted && !v.paused) })()`, { timeout: 10000 }),
      )
      await page.evaluate(`${list}.scrollTo({ top: 0 })`)
      await sleep(1000)
      check(
        "devbits: sound stays on while swiping",
        await page.waitFor(`(() => { const v = ${videos}[0]; return Boolean(v && !v.muted && !v.paused) })()`, { timeout: 10000 }),
      )
      await page.evaluate(click(`document.querySelector("[data-devbit] [data-devbit-video]")`))
      check("devbits: tapping the video pauses it", await page.waitFor(`${videos}[0]?.paused === true`, { timeout: 5000 }))

      const slideOf = (id) => `document.querySelector('[data-devbit="${id}"]')`
      await open(page, `/devbits/${devbits.one}`)
      await page.evaluate(click(`${slideOf(devbits.one)}.querySelector('button[aria-label="Like"]')`))
      check(
        "devbits: liking shows the new count",
        await page.waitFor(`${slideOf(devbits.one)}.querySelector('button[aria-label="Unlike"]')?.textContent.trim() === "1"`, { timeout: 5000 }),
      )
      check("devbits: your own DevBit has no Follow button", !(await page.evaluate(`Boolean(${slideOf(devbits.one)}.querySelector("[data-follow]"))`)))

      const scrolledBefore = (await page.evaluate(DEVBITS_STATE)).scrollTop
      await page.evaluate(click(`${slideOf(devbits.one)}.querySelector('button[aria-label="Comments"]')`))
      check("devbits: comments open in a panel", await page.waitFor(`document.querySelector('[role="dialog"]')?.textContent.includes("Comments")`, { timeout: 5000 }))
      check(
        "devbits: opening comments doesn't bring up the keyboard",
        !(await page.evaluate(`Boolean(document.activeElement?.matches?.("input, textarea"))`)),
      )
      const comment = `bit comment ${run}`
      await page.type('[role="dialog"] input[placeholder="Add a comment..."]', comment)
      await page.evaluate(click(`document.querySelector('[role="dialog"] button[aria-label="Post comment"]')`))
      check(
        "devbits: a comment can be added from the panel",
        await page.waitFor(`document.querySelector('[role="dialog"]')?.textContent.includes(${JSON.stringify(comment)})`, { timeout: 5000 }),
      )
      await page.evaluate(click(`[...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim() === "Close")`))
      await page.waitFor(`!document.querySelector('[role="dialog"]')`, { timeout: 5000 })
      const afterComments = await page.evaluate(DEVBITS_STATE)
      const commentCount = await page.evaluate(`${slideOf(devbits.one)}.querySelector('button[aria-label="Comments"]')?.textContent.trim()`)
      check(
        "devbits: closing comments leaves the DevBit in place, with its new count",
        afterComments.scrollTop === scrolledBefore && commentCount === "1",
        `scrolled ${scrolledBefore}px before and ${afterComments.scrollTop}px after; count ${commentCount}`,
      )

      const link = `${BASE}/devbits/${devbits.one}`
      await page.evaluate(`navigator.share = async (data) => { window.__shared = data.url }`)
      await page.evaluate(click(`${slideOf(devbits.one)}.querySelector('button[aria-label="Share"]')`))
      check("devbits: share hands the DevBit's link to the share sheet", await page.waitFor(`window.__shared === ${JSON.stringify(link)}`, { timeout: 5000 }))
      await page.evaluate(`navigator.share = undefined; navigator.clipboard.writeText = async (text) => { window.__copied = text }`)
      await page.evaluate(click(`${slideOf(devbits.one)}.querySelector('button[aria-label="Share"]')`))
      check(
        "devbits: without a share sheet, share copies the link",
        await page.waitFor(`window.__copied === ${JSON.stringify(link)} && document.body.textContent.includes("Link copied")`, { timeout: 5000 }),
      )

      // Enough comments to scroll: the box to write one stays in view.
      for (let i = 0; i < 12; i++) await api("POST", `/api/posts/${devbits.one}/comments`, b.token, { text: `filler ${i} ${run}` })
      await open(page, `/devbits/${devbits.one}`)
      await page.evaluate(click(`${slideOf(devbits.one)}.querySelector('button[aria-label="Comments"]')`))
      await page.waitFor(`document.querySelector('[role="dialog"]')?.textContent.includes("filler 11")`, { timeout: 5000 })
      const form = await page.evaluate(`(() => {
        const dialog = document.querySelector('[role="dialog"]').getBoundingClientRect()
        const input = document.querySelector('[role="dialog"] input[placeholder="Add a comment..."]').getBoundingClientRect()
        return { dialogTop: dialog.top, dialogBottom: dialog.bottom, inputTop: input.top, inputBottom: input.bottom }
      })()`)
      check(
        "devbits: with many comments, the comment box stays in view",
        form.inputTop >= form.dialogTop && form.inputBottom <= form.dialogBottom,
        JSON.stringify(form),
      )
      await page.evaluate(click(`[...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim() === "Close")`))
      await page.waitFor(`!document.querySelector('[role="dialog"]')`, { timeout: 5000 })

      await open(page, `/devbits/${devbits.two}`)
      check("devbits: someone else's DevBit offers Follow", await page.waitFor(`Boolean(${slideOf(devbits.two)}?.querySelector("[data-follow]"))`, { timeout: 10000 }))
      await page.evaluate(click(`${slideOf(devbits.two)}.querySelector("[data-follow]")`))
      check("devbits: Follow goes away once you follow", await page.waitFor(`!${slideOf(devbits.two)}.querySelector("[data-follow]")`, { timeout: 5000 }))

      await api("DELETE", `/api/posts/${devbits.two}`, b.token)
      await page.evaluate(click(`${slideOf(devbits.two)}.querySelector('button[aria-label="Like"]')`))
      check(
        "devbits: liking a DevBit deleted while you watch says it was removed",
        await page.waitFor(`document.body.textContent.includes("This DevBit was removed")`, { timeout: 5000 }),
      )
      check("devbits: and it leaves the feed", await page.waitFor(`!${slideOf(devbits.two)}`, { timeout: 5000 }))

      await open(page, `/devbits/${devbits.three}`)
      await page.evaluate(click(`${slideOf(devbits.three)}.querySelector('button[aria-label="More"]')`))
      await page.waitFor(`document.querySelector('[role="dialog"]')?.textContent.includes("Delete this DevBit?")`, { timeout: 5000 })
      await page.evaluate(click(`[...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim() === "Delete")`))
      check("devbits: deleting your own DevBit takes it out of the feed", await page.waitFor(`!${slideOf(devbits.three)}`, { timeout: 10000 }))
      check("devbits: and deletes it", (await fetch(`${BASE}/api/posts/${devbits.three}`)).status === 404)

      await open(page, `/p/${devbits.one}`)
      check(
        "devbits: a post link to a DevBit opens it in the DevBits screen",
        await page.waitFor(`location.pathname === ${JSON.stringify(`/devbits/${devbits.one}`)}`, { timeout: 10000 }),
      )
      await open(page, `/devbits/${postId}`)
      check(
        "devbits: a DevBits link to a regular post opens the post page",
        await page.waitFor(`location.pathname === ${JSON.stringify(`/p/${postId}`)}`, { timeout: 10000 }),
      )
    }

    console.log("\n[devbit posting]")
    if (!process.env.MUX_TOKEN_ID) {
      console.log("  skip devbit posting (MUX_TOKEN_ID is not set)")
    } else {
      const input = 'main input[type="file"][accept^="video"]'
      await open(page, "/devbits")
      await page.evaluate(click(`document.querySelector('a[aria-label="Post a DevBit"]')`))
      check(
        "devbits: the + button opens Create on its DevBit tab",
        await page.waitFor(
          `location.pathname === "/create" && document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.includes("DevBit")`,
          { timeout: 10000 },
        ),
      )
      await tabRowChecks(page, "create", 4)
      const chooser = await page.evaluate(buttonHeight("Choose video"))
      check(`create: the DevBit tab's Choose video button is at least ${TAP_TARGET}px tall`, chooser >= TAP_TARGET, `height ${chooser}px`)

      await page.setInputFiles(input, [fixture("clip-95s.mp4")])
      check(
        "create: a DevBit over 90 seconds is refused before uploading",
        await page.waitFor(`document.querySelector("main").textContent.includes("DevBits can be at most 90 seconds long.")`, { timeout: 15000 }),
      )

      await page.setInputFiles(input, [fixture("clip-2s.mp4")])
      const caption = `posted devbit ${run}`
      await page.type("#caption", caption)
      await page.evaluate(click(`[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "Post")`))
      const landed = await page.waitFor(`location.pathname.startsWith("/devbits/")`, { timeout: 180000 })
      check(
        "create: posting a DevBit lands on it in the DevBits screen",
        landed && (await page.waitFor(`document.querySelector("[data-devbit]")?.textContent.includes(${JSON.stringify(caption)})`, { timeout: 15000 })),
      )
      // Through the tab bar, so the Home list is the one already in memory.
      await page.evaluate(click(`document.querySelector('nav[aria-label="Primary"] a[href="/"]')`))
      await page.waitFor(`location.pathname === "/" && !document.querySelector(".animate-pulse")`, { timeout: 15000 })
      await sleep(500)
      check(
        "home: a new DevBit stays out of the Home feed",
        !(await page.evaluate(`document.querySelector("main").textContent.includes(${JSON.stringify(caption)})`)),
      )
    }

    console.log("\n[profile devbits]")
    if (!devbits) {
      console.log("  skip profile devbits (MUX_TOKEN_ID is not set)")
    } else {
      const tile = `document.querySelector('main a[href="/devbits/${devbits.one}?user=${names.a}"]')`
      await open(page, `/profile/${names.a}`)
      check(
        "profile: the Posts tab leaves DevBits out",
        !(await page.evaluate(`Boolean(document.querySelector('main a[href="/p/${devbits.one}"]'))`)),
      )
      // Radix tabs switch on mouse down, as a tap starts, not on click().
      await page.evaluate(`[...document.querySelectorAll('main [role="tab"]')]
        .find((tab) => tab.textContent.includes("DevBits"))
        ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))`)
      check("profile: the DevBits tab lists your DevBits", await page.waitFor(`Boolean(${tile})`, { timeout: 10000 }))
      check(
        "profile: DevBit tiles show the video's thumbnail",
        await page.evaluate(`${tile}.querySelector("img")?.src.startsWith("https://image.mux.com/") === true`),
      )
      await page.evaluate(click(tile))
      check(
        "profile: a DevBit tile opens it in the DevBits screen",
        await page.waitFor(`location.pathname === ${JSON.stringify(`/devbits/${devbits.one}`)} && document.querySelector("[data-devbit]") !== null`, { timeout: 15000 }),
      )
      await sleep(500)
      const opened = await page.evaluate(DEVBITS_STATE)
      const onScreen = opened.list ? opened.slides[Math.round(opened.scrollTop / opened.list.height)] : null
      check("profile: the DevBits screen opens at the tapped DevBit", onScreen?.id === devbits.one, JSON.stringify(onScreen))
      check(
        "profile: it swipes through only that person's DevBits",
        opened.slides.length > 0 && opened.slides.every((slide) => slide.author === names.a),
        opened.slides.map((slide) => slide.author).join(", "),
      )
    }

    console.log("\n[photo upload]")
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.log("  skip photo upload (BLOB_READ_WRITE_TOKEN is not set)")
    } else {
      const photoInput = 'main input[type="file"][accept^="image"]'
      await open(page, "/create")
      const chooser = await page.evaluate(buttonHeight("Choose photo"))
      check(`create: the Choose photo button is at least ${TAP_TARGET}px tall`, chooser >= TAP_TARGET, `height ${chooser}px`)

      await page.setInputFiles(photoInput, [fixture("not-a-photo.heic")])
      check(
        "create: a photo the browser cannot read gets a clear message",
        await page.waitFor(`document.querySelector("main").textContent.includes("This photo format isn't supported here")`, { timeout: 5000 }),
      )

      await page.setInputFiles(photoInput, [fixture("wide-3000x1500.png")])
      check(
        "create: the chosen photo shows a preview and finishes uploading",
        await page.waitFor(
          `[...document.querySelectorAll("main img")].some((img) => img.src.startsWith("blob:")) &&
           document.querySelector("main").textContent.includes("Photo ready")`,
          { timeout: 30000 },
        ),
      )
      const caption = `phone photo ${run}`
      await page.type("#caption", caption)
      await page.evaluate(click(`[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "Post")`))
      const posted = await page.waitFor(`location.pathname === "/"`, { timeout: 15000 })
      await sleep(800)
      const stored = await page.evaluate(`(async () => {
        const text = [...document.querySelectorAll("main p")].find((p) => p.textContent.includes(${JSON.stringify(caption)}))
        const img = text?.closest(".rounded-lg")?.querySelector('img[src*=".public.blob.vercel-storage.com/posts/"]')
        if (!img) return null
        await img.decode().catch(() => undefined)
        return { width: img.naturalWidth, height: img.naturalHeight }
      })()`)
      check("create: the post appears in the feed with the uploaded photo", posted && stored !== null, JSON.stringify(stored))
      check("create: a 3000px photo is stored at most 2048px wide", stored !== null && stored.width > 0 && stored.width <= 2048, JSON.stringify(stored))

      // Every uploaded photo is downloaded from Blob's monthly allowance, so
      // the lists fetch them only as they come near the screen.
      for (const [label, route] of [["feed", "/"], ["explore", "/explore"], ["profile", `/profile/${names.a}`]]) {
        await open(page, route)
        const loading = await page.evaluate(
          `[...document.querySelectorAll('main img[src*=".public.blob.vercel-storage.com/posts/"]')].map((img) => img.loading)`,
        )
        check(
          `${label}: uploaded photos load only when scrolled near`,
          loading.length > 0 && loading.every((value) => value === "lazy"),
          JSON.stringify(loading),
        )
      }

      console.log("\n[profile picture upload]")
      await open(page, "/settings")
      const avatarButton = await page.evaluate(buttonHeight("Upload photo"))
      check(`settings: the Upload photo button is at least ${TAP_TARGET}px tall`, avatarButton >= TAP_TARGET, `height ${avatarButton}px`)
      const saveDisabled = `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "Save Profile")?.disabled`
      // A slow connection keeps the upload going long enough to try saving.
      await page.cdp("Network.enable")
      await page.cdp("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: 16 * 1024 })
      await page.setInputFiles(photoInput, [fixture("wide-3000x1500.png")])
      check("settings: Save Profile waits while the profile picture uploads", await page.waitFor(`${saveDisabled} === true`, { timeout: 10000 }))
      await page.cdp("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
      await page.cdp("Network.disable")
      check(
        "settings: an uploaded profile picture fills the picture field",
        await page.waitFor(`document.querySelector("#avatar")?.value.includes(".public.blob.vercel-storage.com/avatars/")`, { timeout: 30000 }),
      )
      check("settings: Save Profile comes back once the upload finishes", await page.waitFor(`${saveDisabled} === false`, { timeout: 5000 }))
      await page.evaluate(click(`[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "Save Profile")`))
      await sleep(1500)
      await open(page, `/profile/${names.a}`)
      const avatarSrc = await page.evaluate(`document.querySelector("main img")?.src || ""`)
      check("profile: shows the uploaded profile picture", avatarSrc.includes("/avatars/"), avatarSrc)
    }

    console.log("\n[video upload]")
    if (!process.env.MUX_TOKEN_ID) {
      console.log("  skip video upload (MUX_TOKEN_ID is not set)")
    } else {
      const videoInput = 'main input[type="file"][accept^="video"]'
      const postButton = `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "Post")`
      const waitingButton = `[...document.querySelectorAll("main button")].some((b) => b.textContent.includes("Processing video"))`
      const openVideoTab = async () => {
        await open(page, "/create")
        // Radix tabs switch on mouse down, as a tap starts, not on click().
        await page.evaluate(`[...document.querySelectorAll('[role="tab"]')]
          .find((tab) => tab.textContent.includes("Video"))
          ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))`)
        await sleep(300)
      }

      await openVideoTab()
      const chooser = await page.evaluate(buttonHeight("Choose video"))
      check(`create: the Choose video button is at least ${TAP_TARGET}px tall`, chooser >= TAP_TARGET, `height ${chooser}px`)

      // Some phones never report a video's length (power saving); the upload goes ahead.
      await page.evaluate(`void Object.defineProperty(HTMLMediaElement.prototype, "src", { configurable: true, get() { return "" }, set() {} })`)
      await page.setInputFiles(videoInput, [fixture("clip-2s.mp4")])
      check(
        "create: a video whose length the browser never reports still uploads",
        await page.waitFor(`document.querySelector("main").textContent.includes("Video ready")`, { timeout: 45000 }),
      )

      // Post pressed while the video waits, then a link pasted instead: Post comes back.
      await openVideoTab()
      await page.setInputFiles(videoInput, [fixture("clip-2s.mp4")])
      await page.type("#caption", `link instead ${run}`)
      await page.evaluate(click(postButton))
      await page.waitFor(waitingButton, { timeout: 10000 })
      await page.type("#videoUrl", "https://youtu.be/dQw4w9WgXcQ")
      check(
        "create: pasting a link while a video waits gives Post back",
        await page.waitFor(`(() => { const post = ${postButton}; return Boolean(post && !post.disabled) })()`, { timeout: 5000 }),
      )

      await openVideoTab()
      await page.setInputFiles(videoInput, [fixture("clip-2s.mp4")])
      const caption = `phone video ${run}`
      await page.type("#caption", caption)
      // An impatient double press while the video is still uploading.
      await page.evaluate(`(() => {
        const post = [...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "Post")
        post.click()
        post.click()
      })()`)
      check(
        "create: Post waits while the video is processed",
        await page.waitFor(`[...document.querySelectorAll("main button")].some((b) => b.textContent.includes("Processing video"))`, { timeout: 10000 }),
      )
      const posted = await page.waitFor(`location.pathname === "/"`, { timeout: 180000 })
      check("create: the video posts itself once it is ready", posted)
      await sleep(1000)
      const copies = await page.evaluate(
        `[...document.querySelectorAll("main p")].filter((p) => p.textContent.includes(${JSON.stringify(caption)})).length`,
      )
      check("create: pressing Post twice makes one post", copies === 1, `${copies} posts`)
    }

    console.log("\n[small phone]")
    await page.setViewport(SMALL_PHONE)
    await open(page, "/")
    const small = await page.evaluate(SHELL)
    await shot(page, "small-home")
    check("small phone, home: fits the width of the screen", fitsScreen(small, SMALL_PHONE), widthDetail(small, SMALL_PHONE))
    check(
      "small phone: all five tabs are at least 44px wide",
      Boolean(small.tabBar) && small.tabBar.links.length === 5 && small.tabBar.links.every((link) => link.width >= TAP_TARGET),
      small.tabBar ? small.tabBar.links.map((link) => `${link.label} ${link.width}px`).join(", ") : "no tab bar",
    )
    await open(page, "/devbits")
    const smallDevbits = await page.evaluate(SHELL)
    check("small phone, devbits: fits the width of the screen", fitsScreen(smallDevbits, SMALL_PHONE), widthDetail(smallDevbits, SMALL_PHONE))
    await open(page, `/p/${codePosts.page}`)
    const smallCode = await page.evaluate(SHELL)
    check("small phone, three-file post: fits the width of the screen", fitsScreen(smallCode, SMALL_PHONE), widthDetail(smallCode, SMALL_PHONE))
    await tabRowChecks(page, "small phone, three-file post", 3)
    await open(page, `/p/${postId}`)
    const smallWide = await page.evaluate(SHELL)
    check("small phone, a 300-character line: fits the width of the screen", fitsScreen(smallWide, SMALL_PHONE), widthDetail(smallWide, SMALL_PHONE))
    if (githubPostId) {
      await open(page, `/p/${githubPostId}`)
      const smallGitHub = await page.evaluate(SHELL)
      check("small phone, GitHub post: fits the width of the screen", fitsScreen(smallGitHub, SMALL_PHONE), widthDetail(smallGitHub, SMALL_PHONE))
      const smallView = await page.evaluate(githubView(`document.querySelector("main")`))
      check("small phone, GitHub post: the header line shortens instead of widening the page", smallView?.sourceFits === true, JSON.stringify(smallView))
    }
    await open(page, "/notifications")
    await shot(page, "small-notifications")
    await tabRowChecks(page, "small phone, notifications", 5)
    await open(page, "/settings")
    await shot(page, "small-settings")
    await tabRowChecks(page, "small phone, settings", 4)
    const smallSettings = await page.evaluate(SHELL)
    check(
      "small phone, settings: fits the width of the screen",
      fitsScreen(smallSettings, SMALL_PHONE),
      widthDetail(smallSettings, SMALL_PHONE),
    )
    await open(page, "/create")
    await tabRowChecks(page, "small phone, create", 4)

    console.log("\n[safe areas]")
    await page.setViewport(PHONE)
    let insets = true
    try {
      await page.cdp("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34, left: 0, right: 0 } })
    } catch {
      insets = false
    }
    await open(page, "/")
    const notched = await page.evaluate(SHELL)
    await shot(page, "safe-areas")
    check("pages ask for the full screen (viewport-fit=cover)", /viewport-fit=cover/.test(notched.viewportMeta), notched.viewportMeta)
    if (insets) {
      check("top bar keeps clear of the notch", notched.headerPaddingTop === 47, `top padding ${notched.headerPaddingTop}px for a 47px inset`)
      check(
        "tab bar keeps clear of the home indicator",
        notched.tabBar?.paddingBottom === 34,
        `bottom padding ${notched.tabBar?.paddingBottom}px for a 34px inset`,
      )
      await page.cdp("Emulation.setSafeAreaInsetsOverride", { insets: {} })
    } else {
      console.log("  skip safe-area insets (this Chrome cannot emulate them)")
    }

    console.log("\n[desktop]")
    await page.setViewport(DESKTOP)
    await open(page, "/")
    const desktop = await page.evaluate(SHELL)
    await shot(page, "desktop-home")
    check("desktop: no bottom tab bar", !desktop.tabBar)
    check("desktop: no back arrow", !desktop.back)
    check("desktop: the sidebar is shown", desktop.sidebar)
    check("desktop: top bar links to Create", desktop.headerLinks.includes("/create"))
    check(
      "desktop: the sidebar links to DevBits",
      await page.evaluate(`[...document.querySelectorAll('a[href="/devbits"]')].some((link) => link.getBoundingClientRect().width > 0 && !link.closest("main"))`),
    )
    // Without the test DevBits the screen shows its empty state, not the column.
    if (!devbits) {
      console.log("  skip desktop devbits column (MUX_TOKEN_ID is not set)")
    } else {
      await open(page, "/devbits")
      const desktopDevbits = await page.evaluate(`(() => {
        const list = document.querySelector("[data-devbits-list]")
        return {
          pageHeight: document.documentElement.scrollHeight,
          height: innerHeight,
          listBottom: list ? list.getBoundingClientRect().bottom : null,
        }
      })()`)
      check(
        "desktop, devbits: the DevBits column fits the window",
        desktopDevbits.listBottom !== null &&
          desktopDevbits.listBottom <= desktopDevbits.height + 1 &&
          desktopDevbits.pageHeight <= desktopDevbits.height + 1,
        JSON.stringify(desktopDevbits),
      )
    }

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

    // Code written in the plain box while the window was narrow is still
    // there when Monaco comes back.
    await openCodeTab(page)
    await page.waitFor(`Boolean(document.querySelector("main .monaco-editor .view-lines"))`, { timeout: 30000 })
    await typeInMonaco("let a = 1")
    await page.evaluate(click(addFile))
    await page.waitFor(`${monacoText} === ""`, { timeout: 5000 })
    await page.type("main input#file-name", "b.js")
    await typeInMonaco("let b = 2")
    await page.setViewport({ width: 700, height: 800, mobile: false })
    check(
      "desktop, create: a window narrower than 768px gets the plain box",
      await page.waitFor(`Boolean(document.querySelector("main textarea#code"))`, { timeout: 5000 }),
    )
    await page.evaluate(selectTab("Untitled"))
    await page.type("main textarea#code", " // edited")
    await page.setViewport(DESKTOP)
    check(
      "desktop, create: widening it again keeps what was written in the plain box",
      await page.waitFor(`${monacoText} === "let a = 1 // edited"`, { timeout: 15000 }),
      String(await page.evaluate(monacoText)),
    )
    await page.evaluate(selectTab("b.js"))
    check("desktop, create: and every other file's code", await page.waitFor(`${monacoText} === "let b = 2"`, { timeout: 5000 }))

    // TypeScript with JSX gets no false errors; a real mistake still shows.
    await page.evaluate(click(addFile))
    await page.waitFor(`${monacoText} === ""`, { timeout: 5000 })
    await page.type("main input#file-name", "App.tsx")
    const setMonaco = (text) => `window.monaco.editor.getEditors()[0].setValue(${JSON.stringify(text)})`
    const monacoErrors = `(() => {
      const model = window.monaco.editor.getEditors()[0]?.getModel()
      if (!model) return -1
      return window.monaco.editor.getModelMarkers({ resource: model.uri }).filter((marker) => marker.severity === window.monaco.MarkerSeverity.Error).length
    })()`
    await page.evaluate(setMonaco("const broken = ("))
    check("desktop, create: Monaco marks a real mistake", await page.waitFor(`${monacoErrors} > 0`, { timeout: 20000 }))
    await page.evaluate(setMonaco('import React from "react"\nexport const App = () => <div className="a">hi</div>\n'))
    check(
      "desktop, create: and nothing in valid TSX",
      await page.waitFor(`${monacoErrors} === 0`, { timeout: 20000 }),
      `${await page.evaluate(monacoErrors)} errors`,
    )

    // If the editor's own code can't load (after a deploy, say), the plain box takes over.
    const noChunk = await browser.newPage(DESKTOP)
    await noChunk.cdp("Network.enable")
    await noChunk.cdp("Network.setBlockedURLs", { urls: ["*monaco-input*"] })
    await openCodeTab(noChunk)
    check(
      "desktop, create: when the editor's code can't load, the plain box says so",
      await noChunk.waitFor(
        `(document.querySelector("main")?.textContent ?? "").includes("The full editor couldn't load — you can still write here.") && Boolean(document.querySelector("main textarea#code"))`,
        { timeout: 15000 },
      ),
    )
    await noChunk.close()
  } catch (error) {
    failures++
    console.log(`  FAIL the check stopped early -- ${error.message}`)
  } finally {
    if (browser) await browser.close()
    const { summary, leftovers } = await removeTestUsers(BASE, Object.values(names))
    console.log(`\n${summary}`)
    check(
      "cleanup removed the test users from the target's database",
      leftovers.length === 0,
      `still there: ${leftovers.join(", ")} -- set SMOKE_DB to the database ${BASE} uses`,
    )
  }

  console.log(`\n${checks} checks, ${failures} failed`)
  process.exit(failures ? 1 : 0)
}

main()
