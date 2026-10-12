// End-to-end API smoke test. Needs `npm run dev` running and MONGODB_URI in .env.local.
// Usage: npm run smoke            (all sections)
//        npm run smoke -- posts   (one or more named sections)
import mongoose from "mongoose"

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000"
const run = Math.random().toString(36).slice(2, 8)
export const names = { a: `smoke_${run}_a`, b: `smoke_${run}_b` }
const state = {}
let checks = 0
let failures = 0

function check(name, condition, detail = "") {
  checks++
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ""}`)
  }
}

async function api(method, path, { token, body, raw } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (raw !== undefined) {
    headers["Content-Type"] = "application/json"
    payload = raw
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json"
    payload = JSON.stringify(body)
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload })
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {}
  return { status: res.status, data, text }
}

async function ensureUsers() {
  if (state.a) return
  for (const key of ["a", "b"]) {
    const password = "smoke-pass-1"
    const res = await api("POST", "/api/auth/register", {
      body: {
        username: names[key],
        email: `${names[key]}@example.com`,
        password,
        fullName: `Smoke ${key.toUpperCase()}`,
      },
    })
    if (res.status !== 201) {
      throw new Error(`could not register ${names[key]}: ${res.status} ${res.text.slice(0, 200)}`)
    }
    state[key] = { token: res.data.token, user: res.data.user, password }
  }
}

const sections = {
  async health() {
    const res = await api("GET", "/api/health")
    check("health responds 200", res.status === 200, `status ${res.status}`)
    check("mongodb connected", res.data?.mongodb === "connected", res.text.slice(0, 200))
  },
  async auth() {
    await ensureUsers()
    check("register returns a token", typeof state.a.token === "string" && state.a.token.length > 20)
    check("register returns the user", state.a.user?.username === names.a)
    check("register response has no password", !("password" in (state.a.user || {})))
    check("register response includes settings", state.a.user?.notificationSettings?.likes === true)

    const dup = await api("POST", "/api/auth/register", {
      body: { username: names.a, email: `other_${names.a}@example.com`, password: "smoke-pass-1", fullName: "Dup" },
    })
    check("duplicate username is 409", dup.status === 409, `status ${dup.status}`)

    const missing = await api("POST", "/api/auth/register", { body: { username: `${names.a}x` } })
    check("missing fields is 400", missing.status === 400, `status ${missing.status}`)

    const shortPw = await api("POST", "/api/auth/register", {
      body: { username: `${names.a}y`, email: `${names.a}y@example.com`, password: "123", fullName: "Short" },
    })
    check("short password is 400", shortPw.status === 400, `status ${shortPw.status}`)

    const badName = await api("POST", "/api/auth/register", {
      body: { username: "has space", email: `${names.a}z@example.com`, password: "smoke-pass-1", fullName: "Bad" },
    })
    check("invalid username is 400", badName.status === 400, `status ${badName.status}`)

    const malformed = await api("POST", "/api/auth/login", { raw: "{not json" })
    check("malformed JSON is 400", malformed.status === 400, `status ${malformed.status}`)

    const login = await api("POST", "/api/auth/login", {
      body: { email: `${names.a}@example.com`, password: state.a.password },
    })
    check("login is 200 with token", login.status === 200 && typeof login.data?.token === "string", `status ${login.status}`)
    check("login returns bio and website", login.data?.user?.bio === "" && login.data?.user?.website === "")

    const upper = await api("POST", "/api/auth/login", {
      body: { email: `${names.a}@EXAMPLE.com`.toUpperCase(), password: state.a.password },
    })
    check("login ignores email case", upper.status === 200, `status ${upper.status}`)

    const wrong = await api("POST", "/api/auth/login", {
      body: { email: `${names.a}@example.com`, password: "wrong-password" },
    })
    check("wrong password is 401", wrong.status === 401, `status ${wrong.status}`)

    const unknown = await api("POST", "/api/auth/login", {
      body: { email: `nobody_${run}@example.com`, password: "whatever1" },
    })
    check("unknown email is 401", unknown.status === 401, `status ${unknown.status}`)
  },
}

async function cleanup() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection
  const list = Object.values(names)
  const removed = {
    posts: await db.collection("posts").deleteMany({ "author.username": { $in: list } }),
    messages: await db
      .collection("messages")
      .deleteMany({ $or: [{ sender: { $in: list } }, { receiver: { $in: list } }] }),
    notifications: await db
      .collection("notifications")
      .deleteMany({ $or: [{ sender: { $in: list } }, { recipient: { $in: list } }] }),
    users: await db.collection("users").deleteMany({ username: { $in: list } }),
  }
  await mongoose.disconnect()
  console.log(
    `cleanup: ${Object.entries(removed)
      .map(([k, v]) => `${k}=${v.deletedCount}`)
      .join(" ")}`,
  )
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Run through `npm run smoke`.")
    process.exit(2)
  }
  const wanted = process.argv.slice(2)
  const unknown = wanted.filter((name) => !sections[name])
  if (unknown.length) {
    console.error(`unknown section(s): ${unknown.join(", ")}. Known: ${Object.keys(sections).join(", ")}`)
    process.exit(2)
  }
  const toRun = wanted.length ? wanted : Object.keys(sections)
  try {
    for (const name of toRun) {
      console.log(`\n[${name}]`)
      try {
        await sections[name]()
      } catch (error) {
        failures++
        console.log(`  FAIL section threw -- ${error.message}`)
      }
    }
  } finally {
    await cleanup()
  }
  console.log(`\n${checks} checks, ${failures} failed`)
  process.exit(failures ? 1 : 0)
}

main()
