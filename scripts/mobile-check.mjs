// Phone-width layout check. Opens every page in headless Chrome at phone
// size, signed in as a throwaway account, and measures the layout.
// Needs the app running, MONGODB_URI in .env.local and Chrome installed.
// Usage: npm run mobile-check
// SMOKE_BASE_URL and SMOKE_DB work as in the smoke test. MOBILE_SHOTS names a
// directory to save a screenshot of each page into.
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { launchBrowser } from "./lib/browser.mjs"
import { assertSameDatabase, removeTestUsers } from "./lib/test-users.mjs"

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000"
const SHOTS = process.env.MOBILE_SHOTS
const PHONE = { width: 390, height: 844 }
const SMALL_PHONE = { width: 320, height: 568 }
const DESKTOP = { width: 1280, height: 800, mobile: false }
const GUTTER = 16
const TAP_TARGET = 44
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
  return { a, b, postId: code._id }
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
    `${label}: its tabs are Home, Explore, Create, Profile`,
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
    const { a, postId } = await seed()
    const tabs = `Home=/ Explore=/explore Create=/create Profile=/profile/${names.a}`
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

      console.log("\n[profile picture upload]")
      await open(page, "/settings")
      const avatarButton = await page.evaluate(buttonHeight("Upload photo"))
      check(`settings: the Upload photo button is at least ${TAP_TARGET}px tall`, avatarButton >= TAP_TARGET, `height ${avatarButton}px`)
      await page.setInputFiles(photoInput, [fixture("wide-3000x1500.png")])
      check(
        "settings: an uploaded profile picture fills the picture field",
        await page.waitFor(`document.querySelector("#avatar")?.value.includes(".public.blob.vercel-storage.com/avatars/")`, { timeout: 30000 }),
      )
      await page.evaluate(click(`[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "Save Profile")`))
      await sleep(1500)
      await open(page, `/profile/${names.a}`)
      const avatarSrc = await page.evaluate(`document.querySelector("main img")?.src || ""`)
      check("profile: shows the uploaded profile picture", avatarSrc.includes("/avatars/"), avatarSrc)
    }

    console.log("\n[small phone]")
    await page.setViewport(SMALL_PHONE)
    await open(page, "/")
    const small = await page.evaluate(SHELL)
    await shot(page, "small-home")
    check("small phone, home: fits the width of the screen", fitsScreen(small, SMALL_PHONE), widthDetail(small, SMALL_PHONE))
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
