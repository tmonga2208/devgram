// End-to-end API smoke test. Needs `npm run dev` running and MONGODB_URI in .env.local.
// Usage: npm run smoke            (all sections)
//        npm run smoke -- posts   (one or more named sections)
// SMOKE_BASE_URL picks the server. SMOKE_DB names that server's database when
// it is not the one in MONGODB_URI.
import { readFile } from "node:fs/promises"
import { BlobNotFoundError, head, list } from "@vercel/blob"
import { put } from "@vercel/blob/client"
import Mux, { NotFoundError } from "@mux/mux-node"
import { assertSameDatabase, removeTestUsers } from "./lib/test-users.mjs"

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

async function fetchRaw(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual" })
  const buffer = Buffer.from(await res.arrayBuffer())
  return { status: res.status, headers: res.headers, buffer, text: buffer.toString("utf8") }
}

// Width and height from a PNG's header, or null when the bytes are not a PNG.
function pngSize(buffer) {
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
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

const PHOTO_FIXTURE = new URL("../public/icons/icon-192.png", import.meta.url)

// Uploads the fixture PNG the way the browser does: a pass from the app, then
// straight to Blob. Returns the photo's public URL.
async function uploadTestPhoto(user, purpose) {
  const png = await readFile(PHOTO_FIXTURE)
  const pass = await api("POST", "/api/uploads/image", {
    token: user.token,
    body: { purpose, contentType: "image/png", size: png.length },
  })
  if (pass.status !== 200) throw new Error(`photo upload pass answered ${pass.status}`)
  const blob = await put(pass.data.pathname, png, { access: "public", token: pass.data.token, contentType: "image/png" })
  return blob.url
}

async function blobExists(url) {
  try {
    await head(url)
    return true
  } catch (error) {
    if (error instanceof BlobNotFoundError) return false
    throw error
  }
}

const CLIP_FIXTURE = new URL("./fixtures/clip-2s.mp4", import.meta.url)
const NOT_A_VIDEO_FIXTURE = new URL("./fixtures/not-a-video.mp4", import.meta.url)

async function putFile(url, fixture) {
  const res = await fetch(url, { method: "PUT", body: await readFile(fixture) })
  if (!res.ok) throw new Error(`upload to Mux answered ${res.status}`)
}

// Polls the upload until Mux says ready or failed, for at most two minutes.
async function waitForUpload(user, uploadId) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const res = await api("GET", `/api/uploads/video/${uploadId}`, { token: user.token })
    if (res.data?.status === "ready" || res.data?.status === "failed") return res.data
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  return { status: "still waiting after two minutes" }
}

async function muxAssetExists(assetId) {
  try {
    await new Mux().video.assets.retrieve(assetId)
    return true
  } catch (error) {
    if (error instanceof NotFoundError) return false
    throw error
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

    const longEmail = await api("POST", "/api/auth/register", {
      body: { username: names.a, email: `${"e".repeat(250)}@example.com`, password: "smoke-pass-1", fullName: "Long" },
    })
    check("email over 254 characters is 400", longEmail.status === 400, `status ${longEmail.status}`)
    const longName = await api("POST", "/api/auth/register", {
      body: { username: names.a, email: `long_${names.a}@example.com`, password: "smoke-pass-1", fullName: "n".repeat(101) },
    })
    check("full name over 100 characters is 400", longName.status === 400, `status ${longName.status}`)
    const longPassword = await api("POST", "/api/auth/register", {
      body: { username: names.a, email: `long_${names.a}@example.com`, password: "p".repeat(129), fullName: "Long" },
    })
    check("password over 128 characters is 400", longPassword.status === 400, `status ${longPassword.status}`)

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
  async posts() {
    await ensureUsers()
    const { a, b } = state
    const missingId = "0123456789abcdef01234567"
    const sameLanguage = await api("POST", "/api/posts", {
      token: b.token,
      body: { caption: `same language ${run}`, code: "y", language: "javascript" },
    })
    const sameLanguageId = sameLanguage.data?._id

    const noToken = await api("POST", "/api/posts", { body: { caption: "x" } })
    check("create without token is 401", noToken.status === 401, `status ${noToken.status}`)
    const garbage = await api("POST", "/api/posts", { token: "not.a.token", body: { caption: "x" } })
    check("create with garbage token is 401", garbage.status === 401, `status ${garbage.status}`)
    const noCaption = await api("POST", "/api/posts", { token: a.token, body: { image: "https://example.com/a.png" } })
    check("create without caption is 400", noCaption.status === 400, `status ${noCaption.status}`)
    const wrongType = await api("POST", "/api/posts", { token: a.token, body: { caption: 42 } })
    check("caption wrong type is 400", wrongType.status === 400, `status ${wrongType.status}`)
    const jsUrl = await api("POST", "/api/posts", {
      token: a.token,
      body: { caption: "bad", image: "javascript:alert(1)" },
    })
    check("javascript: image url is 400", jsUrl.status === 400, `status ${jsUrl.status}`)
    const longCaption = await api("POST", "/api/posts", { token: a.token, body: { caption: "c".repeat(2201) } })
    check("caption over 2200 characters is 400", longCaption.status === 400, `status ${longCaption.status}`)
    const longCode = await api("POST", "/api/posts", {
      token: a.token,
      body: { caption: "long code", code: "x".repeat(20001), language: "javascript" },
    })
    check("code over 20000 characters is 400", longCode.status === 400, `status ${longCode.status}`)
    const longLanguage = await api("POST", "/api/posts", {
      token: a.token,
      body: { caption: "long language", code: "x", language: "l".repeat(31) },
    })
    check("language over 30 characters is 400", longLanguage.status === 400, `status ${longLanguage.status}`)
    const longVideo = await api("POST", "/api/posts", {
      token: a.token,
      body: { caption: "long video", video: `https://example.com/${"v".repeat(2048)}` },
    })
    check("video URL over 2048 characters is 400", longVideo.status === 400, `status ${longVideo.status}`)
    const longImage = await api("POST", "/api/posts", {
      token: a.token,
      body: { caption: "long image", image: `https://example.com/${"i".repeat(2048)}` },
    })
    check("image URL over 2048 characters is 400", longImage.status === 400, `status ${longImage.status}`)

    const image = await api("POST", "/api/posts", {
      token: a.token,
      body: { caption: `image post ${run}`, image: "https://example.com/a.png" },
    })
    check("create image post is 201", image.status === 201, `status ${image.status} ${image.text.slice(0, 120)}`)
    check("post author is the caller", image.data?.author?.username === names.a)
    check("post author avatar is the placeholder", image.data?.author?.avatar === "/placeholder.svg")
    check("new post has empty likedBy and savedBy", image.data?.likedBy?.length === 0 && image.data?.savedBy?.length === 0)
    const code = await api("POST", "/api/posts", {
      token: a.token,
      body: { caption: `code post ${run} cc @${names.b}`, code: "const x = 1", language: "javascript" },
    })
    check("create code post is 201", code.status === 201, `status ${code.status}`)
    const postId = image.data?._id
    const codeId = code.data?._id

    const list = await api("GET", "/api/posts")
    const ids = Array.isArray(list.data) ? list.data.map((p) => p._id) : []
    check("list includes both posts", list.status === 200 && ids.includes(postId) && ids.includes(codeId))
    check("list is newest first", ids.indexOf(codeId) < ids.indexOf(postId))

    const one = await api("GET", `/api/posts/${postId}`)
    check("get post is 200", one.status === 200 && one.data?._id === postId, `status ${one.status}`)
    const malformedId = await api("GET", "/api/posts/not-an-id")
    check("malformed id is 404", malformedId.status === 404, `status ${malformedId.status}`)
    const absent = await api("GET", `/api/posts/${missingId}`)
    check("unknown id is 404", absent.status === 404, `status ${absent.status}`)

    const likeAnon = await api("POST", `/api/posts/${postId}/like`)
    check("like without token is 401", likeAnon.status === 401, `status ${likeAnon.status}`)
    const like = await api("POST", `/api/posts/${postId}/like`, { token: b.token })
    check("like adds the user", like.status === 200 && like.data?.likes === 1 && like.data?.likedBy?.includes(names.b), like.text.slice(0, 120))
    const unlike = await api("POST", `/api/posts/${postId}/like`, { token: b.token })
    check("second like removes the user", unlike.data?.likes === 0 && !unlike.data?.likedBy?.includes(names.b))
    await Promise.all([
      api("POST", `/api/posts/${postId}/like`, { token: b.token }),
      api("POST", `/api/posts/${postId}/like`, { token: b.token }),
    ])
    const afterRace = await api("GET", `/api/posts/${postId}`)
    check(
      "parallel likes stay consistent",
      afterRace.data?.likes === afterRace.data?.likedBy?.length && afterRace.data?.likes >= 0,
      `likes ${afterRace.data?.likes} likedBy ${afterRace.data?.likedBy?.length}`,
    )
    const likeMissing = await api("POST", `/api/posts/${missingId}/like`, { token: b.token })
    check("like unknown post is 404", likeMissing.status === 404, `status ${likeMissing.status}`)

    const saveAnon = await api("POST", `/api/posts/${postId}/save`)
    check("save without token is 401", saveAnon.status === 401, `status ${saveAnon.status}`)
    const save = await api("POST", `/api/posts/${postId}/save`, { token: b.token })
    check("save adds only the caller", save.status === 200 && save.data?.savedBy?.includes(names.b) && !save.data?.savedBy?.includes(names.a), save.text.slice(0, 120))
    const savedSeenByOwner = await api("GET", `/api/posts/${postId}`, { token: b.token })
    check(
      "the saver sees their own save",
      savedSeenByOwner.data?.savedBy?.length === 1 && savedSeenByOwner.data.savedBy[0] === names.b,
      JSON.stringify(savedSeenByOwner.data?.savedBy),
    )
    const savedSeenAnon = await api("GET", `/api/posts/${postId}`)
    check(
      "anonymous callers cannot see who saved a post",
      Array.isArray(savedSeenAnon.data?.savedBy) && savedSeenAnon.data.savedBy.length === 0,
      JSON.stringify(savedSeenAnon.data?.savedBy),
    )
    const savedSeenByOther = await api("GET", `/api/posts/${postId}`, { token: a.token })
    check(
      "other users cannot see who saved a post",
      Array.isArray(savedSeenByOther.data?.savedBy) && savedSeenByOther.data.savedBy.length === 0,
      JSON.stringify(savedSeenByOther.data?.savedBy),
    )
    const feedAnon = await api("GET", "/api/posts")
    check(
      "the feed hides saves from anonymous callers",
      Array.isArray(feedAnon.data) && feedAnon.data.every((p) => Array.isArray(p.savedBy) && p.savedBy.length === 0),
    )
    const feedOwner = await api("GET", "/api/posts", { token: b.token })
    check("the feed shows the caller their own save", feedOwner.data?.find?.((p) => p._id === postId)?.savedBy?.[0] === names.b)
    const likeByOther = await api("POST", `/api/posts/${postId}/like`, { token: a.token })
    check(
      "a like response does not leak another user's save",
      Array.isArray(likeByOther.data?.savedBy) && likeByOther.data.savedBy.length === 0,
      JSON.stringify(likeByOther.data?.savedBy),
    )
    await api("POST", `/api/posts/${postId}/like`, { token: a.token })
    const searchAnon = await api("GET", `/api/search?q=${encodeURIComponent(`image post ${run}`)}&type=posts`)
    check(
      "search hides saves from anonymous callers",
      searchAnon.data?.posts?.some?.((p) => p._id === postId) && searchAnon.data.posts.every((p) => Array.isArray(p.savedBy) && p.savedBy.length === 0),
    )
    const similarAnon = await api("GET", `/api/posts/similar/${codeId}`)
    check(
      "similar posts hide saves from anonymous callers",
      similarAnon.data?.some?.((p) => p._id === postId) && similarAnon.data.every((p) => Array.isArray(p.savedBy) && p.savedBy.length === 0),
    )
    const unsave = await api("POST", `/api/posts/${postId}/save`, { token: b.token })
    check("second save removes the caller", unsave.status === 200 && !unsave.data?.savedBy?.includes(names.b))

    const commentAnon = await api("POST", `/api/posts/${postId}/comments`, { body: { text: "hi" } })
    check("comment without token is 401", commentAnon.status === 401, `status ${commentAnon.status}`)
    const emptyComment = await api("POST", `/api/posts/${postId}/comments`, { token: b.token, body: { text: "   " } })
    check("empty comment is 400", emptyComment.status === 400, `status ${emptyComment.status}`)
    const comment = await api("POST", `/api/posts/${postId}/comments`, { token: b.token, body: { text: "nice one" } })
    check(
      "comment is 201 with id, author and text",
      comment.status === 201 && typeof comment.data?._id === "string" && comment.data?.username === names.b && comment.data?.text === "nice one",
      `status ${comment.status} ${comment.text.slice(0, 120)}`,
    )
    check("comment carries a createdAt timestamp", !Number.isNaN(Date.parse(comment.data?.createdAt)), `createdAt ${comment.data?.createdAt}`)
    const comments = await api("GET", `/api/posts/${postId}/comments`)
    check("comments list has the comment", comments.status === 200 && comments.data?.length === 1)

    const similar = await api("GET", `/api/posts/similar/${codeId}`)
    check("similar is 200 with an array", similar.status === 200 && Array.isArray(similar.data), `status ${similar.status}`)
    check("similar excludes the post itself", !similar.data?.some?.((p) => p._id === codeId))
    check("similar includes the author's other post", similar.data?.some?.((p) => p._id === postId))
    const similarIds = Array.isArray(similar.data) ? similar.data.map((p) => p._id) : []
    check(
      "similar lists same-language posts before same-author posts",
      similarIds.includes(sameLanguageId) && similarIds.includes(postId) && similarIds.indexOf(sameLanguageId) < similarIds.indexOf(postId),
      `order ${similarIds.map((id) => String(id).slice(-4)).join(",")} wanted ${String(sameLanguageId).slice(-4)} before ${String(postId).slice(-4)}`,
    )

    const deleteOther = await api("DELETE", `/api/posts/${postId}`, { token: b.token })
    check("delete by non-author is 403", deleteOther.status === 403, `status ${deleteOther.status}`)
    const deleteOwn = await api("DELETE", `/api/posts/${postId}`, { token: a.token })
    check("delete by author is 200", deleteOwn.status === 200, `status ${deleteOwn.status}`)
    const gone = await api("GET", `/api/posts/${postId}`)
    check("deleted post is 404", gone.status === 404, `status ${gone.status}`)
  },
  async users() {
    await ensureUsers()
    const { a, b } = state

    const pub = await api("GET", `/api/users/${names.a}`)
    check("public profile is 200", pub.status === 200 && pub.data?.username === names.a, `status ${pub.status}`)
    check("public profile hides password and email", !("password" in (pub.data || {})) && !("email" in (pub.data || {})))
    check("public profile hides settings", !("notificationSettings" in (pub.data || {})) && !("privacySettings" in (pub.data || {})))
    check("public profile has numeric counts", pub.data?.followers === 0 && pub.data?.following === 0)
    check("anonymous viewer is not following", pub.data?.isFollowing === false)
    const nobody = await api("GET", `/api/users/nobody_${run}`)
    check("unknown user is 404", nobody.status === 404, `status ${nobody.status}`)

    const meAnon = await api("GET", "/api/users/profile")
    check("own profile without token is 401", meAnon.status === 401, `status ${meAnon.status}`)
    const meGarbage = await api("GET", "/api/users/profile", { token: "not.a.token" })
    check("own profile with garbage token is 401", meGarbage.status === 401, `status ${meGarbage.status}`)
    const me = await api("GET", "/api/users/profile", { token: a.token })
    check("own profile is 200 with email and settings", me.status === 200 && me.data?.email === `${names.a}@example.com` && me.data?.privacySettings?.isPrivate === false, me.text.slice(0, 120))

    const ownPost = await api("POST", "/api/posts", { token: a.token, body: { caption: `avatar check ${run}`, code: "z", language: "go" } })
    const ownPostId = ownPost.data?._id
    await api("POST", `/api/posts/${ownPostId}/comments`, { token: a.token, body: { text: "my own comment" } })
    await api("POST", `/api/posts/${ownPostId}/comments`, { token: b.token, body: { text: "someone else" } })

    const edit = await api("PATCH", "/api/users/profile", {
      token: a.token,
      body: { fullName: "Smoke Edited", bio: "hello", website: "https://example.com", avatar: "https://example.com/me.png" },
    })
    check(
      "profile edit is 200 and applied",
      edit.status === 200 && edit.data?.fullName === "Smoke Edited" && edit.data?.bio === "hello" && edit.data?.website === "https://example.com" && edit.data?.avatar === "https://example.com/me.png",
      `status ${edit.status} ${edit.text.slice(0, 120)}`,
    )
    const afterAvatar = await api("GET", `/api/posts/${ownPostId}`)
    check("a new avatar reaches the user's existing post", afterAvatar.data?.author?.avatar === "https://example.com/me.png", `author avatar ${afterAvatar.data?.author?.avatar}`)
    check("a new avatar reaches the user's existing comments", afterAvatar.data?.comments?.[0]?.avatar === "https://example.com/me.png", `comment avatar ${afterAvatar.data?.comments?.[0]?.avatar}`)
    check("a new avatar leaves other users' comments alone", afterAvatar.data?.comments?.[1]?.avatar === "/placeholder.svg", `other comment avatar ${afterAvatar.data?.comments?.[1]?.avatar}`)
    const clear = await api("PATCH", "/api/users/profile", { token: a.token, body: { bio: "", website: "", avatar: "" } })
    check("bio and website can be cleared", clear.data?.bio === "" && clear.data?.website === "")
    check("clearing avatar restores the placeholder", clear.data?.avatar === "/placeholder.svg")
    const afterClear = await api("GET", `/api/posts/${ownPostId}`)
    check(
      "clearing the avatar reaches existing posts and comments",
      afterClear.data?.author?.avatar === "/placeholder.svg" && afterClear.data?.comments?.[0]?.avatar === "/placeholder.svg",
      `author ${afterClear.data?.author?.avatar} comment ${afterClear.data?.comments?.[0]?.avatar}`,
    )
    const jsSite = await api("PATCH", "/api/users/profile", { token: a.token, body: { website: "javascript:alert(1)" } })
    check("javascript: website is 400", jsSite.status === 400, `status ${jsSite.status}`)
    const jsAvatar = await api("PATCH", "/api/users/profile", { token: a.token, body: { avatar: "javascript:alert(1)" } })
    check("javascript: avatar is 400", jsAvatar.status === 400, `status ${jsAvatar.status}`)
    const rename = await api("PATCH", "/api/users/profile", { token: a.token, body: { username: `${names.a}_new` } })
    check("username change is 400", rename.status === 400, `status ${rename.status}`)
    const takenEmail = await api("PATCH", "/api/users/profile", { token: a.token, body: { email: `${names.b}@example.com` } })
    check("taken email is 409", takenEmail.status === 409, `status ${takenEmail.status}`)
    const patchAnon = await api("PATCH", "/api/users/profile", { body: { bio: "x" } })
    check("profile edit without token is 401", patchAnon.status === 401, `status ${patchAnon.status}`)

    const notif = await api("PATCH", "/api/users/profile", { token: a.token, body: { notificationSettings: { likes: false, bogus: true } } })
    check(
      "notification settings merge",
      notif.data?.notificationSettings?.likes === false && notif.data?.notificationSettings?.comments === true && !("bogus" in (notif.data?.notificationSettings || {})),
      notif.text.slice(0, 160),
    )
    const privacy = await api("PATCH", "/api/users/profile", { token: a.token, body: { privacySettings: { isPrivate: true } } })
    check("privacy settings merge", privacy.data?.privacySettings?.isPrivate === true && privacy.data?.privacySettings?.allowMessaging === true)
    const reread = await api("GET", "/api/users/profile", { token: a.token })
    check("settings persist", reread.data?.notificationSettings?.likes === false && reread.data?.privacySettings?.isPrivate === true)

    const wrongPw = await api("PATCH", "/api/users/profile", { token: a.token, body: { currentPassword: "wrong-one", newPassword: "smoke-pass-2" } })
    check("wrong current password is 400", wrongPw.status === 400, `status ${wrongPw.status}`)
    const shortPw = await api("PATCH", "/api/users/profile", { token: a.token, body: { currentPassword: a.password, newPassword: "123" } })
    check("short new password is 400", shortPw.status === 400, `status ${shortPw.status}`)
    const changePw = await api("PATCH", "/api/users/profile", { token: a.token, body: { currentPassword: a.password, newPassword: "smoke-pass-2" } })
    check("password change is 200", changePw.status === 200, `status ${changePw.status}`)
    const oldLogin = await api("POST", "/api/auth/login", { body: { email: `${names.a}@example.com`, password: a.password } })
    check("old password no longer works", oldLogin.status === 401, `status ${oldLogin.status}`)
    const newLogin = await api("POST", "/api/auth/login", { body: { email: `${names.a}@example.com`, password: "smoke-pass-2" } })
    check("new password works", newLogin.status === 200, `status ${newLogin.status}`)
    a.password = "smoke-pass-2"

    const followAnon = await api("POST", `/api/users/${names.a}/follow`)
    check("follow without token is 401", followAnon.status === 401, `status ${followAnon.status}`)
    const followSelf = await api("POST", `/api/users/${names.a}/follow`, { token: a.token })
    check("follow yourself is 400", followSelf.status === 400, `status ${followSelf.status}`)
    const followNobody = await api("POST", `/api/users/nobody_${run}/follow`, { token: b.token })
    check("follow unknown user is 404", followNobody.status === 404, `status ${followNobody.status}`)
    const follow = await api("POST", `/api/users/${names.a}/follow`, { token: b.token })
    check("follow sets following and counts", follow.status === 200 && follow.data?.following === true && follow.data?.followers === 1 && follow.data?.followingCount === 1, follow.text.slice(0, 120))
    const seenByB = await api("GET", `/api/users/${names.a}`, { token: b.token })
    check("follower sees isFollowing true", seenByB.data?.isFollowing === true && seenByB.data?.followers === 1)
    const bProfile = await api("GET", `/api/users/${names.b}`)
    check("follower's following count is 1", bProfile.data?.following === 1)
    const unfollow = await api("POST", `/api/users/${names.a}/follow`, { token: b.token })
    check("second follow unfollows", unfollow.data?.following === false && unfollow.data?.followers === 0 && unfollow.data?.followingCount === 0, unfollow.text.slice(0, 120))

    const longWebsite = await api("PATCH", "/api/users/profile", { token: a.token, body: { website: `https://example.com/${"w".repeat(2048)}` } })
    check("website over 2048 characters is 400", longWebsite.status === 400, `status ${longWebsite.status}`)
    const longAvatar = await api("PATCH", "/api/users/profile", { token: a.token, body: { avatar: `https://example.com/${"a".repeat(2048)}` } })
    check("avatar URL over 2048 characters is 400", longAvatar.status === 400, `status ${longAvatar.status}`)
    const longFullName = await api("PATCH", "/api/users/profile", { token: a.token, body: { fullName: "n".repeat(101) } })
    check("profile full name over 100 characters is 400", longFullName.status === 400, `status ${longFullName.status}`)
    const longNewEmail = await api("PATCH", "/api/users/profile", { token: a.token, body: { email: `${"e".repeat(250)}@example.com` } })
    check("profile email over 254 characters is 400", longNewEmail.status === 400, `status ${longNewEmail.status}`)
    const longNewPassword = await api("PATCH", "/api/users/profile", { token: a.token, body: { currentPassword: a.password, newPassword: "p".repeat(129) } })
    check("new password over 128 characters is 400", longNewPassword.status === 400, `status ${longNewPassword.status}`)
  },
  async social() {
    await ensureUsers()
    const { a, b } = state

    const msgAnon = await api("POST", "/api/messages", { body: { receiver: names.a, content: "hi" } })
    check("message without token is 401", msgAnon.status === 401, `status ${msgAnon.status}`)
    const msgEmpty = await api("POST", "/api/messages", { token: b.token, body: { receiver: names.a, content: "  " } })
    check("empty message is 400", msgEmpty.status === 400, `status ${msgEmpty.status}`)
    const msgNobody = await api("POST", "/api/messages", { token: b.token, body: { receiver: `nobody_${run}`, content: "hi" } })
    check("message to unknown user is 404", msgNobody.status === 404, `status ${msgNobody.status}`)
    const msgSelf = await api("POST", "/api/messages", { token: b.token, body: { receiver: names.b, content: "hi" } })
    check("message to yourself is 400", msgSelf.status === 400, `status ${msgSelf.status}`)
    const msg = await api("POST", "/api/messages", { token: b.token, body: { receiver: names.a, content: `hello ${run}` } })
    check("message is 201", msg.status === 201 && msg.data?.sender === names.b && msg.data?.content === `hello ${run}`, `status ${msg.status} ${msg.text.slice(0, 120)}`)

    const convAnon = await api("GET", "/api/messages")
    check("conversations without token is 401", convAnon.status === 401, `status ${convAnon.status}`)
    const conv = await api("GET", "/api/messages", { token: a.token })
    const withB = Array.isArray(conv.data) ? conv.data.find((c) => c.username === names.b) : null
    check("receiver sees the conversation", conv.status === 200 && withB?.lastMessage?.content === `hello ${run}`, conv.text.slice(0, 160))
    const thread = await api("GET", `/api/messages/${names.b}`, { token: a.token })
    check("thread has the message", thread.status === 200 && thread.data?.length === 1 && thread.data[0].content === `hello ${run}`, `status ${thread.status}`)
    const threadAnon = await api("GET", `/api/messages/${names.b}`)
    check("thread without token is 401", threadAnon.status === 401, `status ${threadAnon.status}`)

    const post = await api("POST", "/api/posts", { token: a.token, body: { caption: `searchable${run} cc @${names.b}`, code: "x", language: "python" } })
    const postId = post.data?._id
    await api("POST", `/api/users/${names.a}/follow`, { token: b.token })
    await api("POST", `/api/posts/${postId}/like`, { token: b.token })
    await api("POST", `/api/posts/${postId}/comments`, { token: b.token, body: { text: "commenting" } })
    await api("POST", `/api/posts/${postId}/like`, { token: a.token })

    const notifAnon = await api("GET", "/api/notifications")
    check("notifications without token is 401", notifAnon.status === 401, `status ${notifAnon.status}`)
    const notifs = await api("GET", "/api/notifications", { token: a.token })
    const types = Array.isArray(notifs.data) ? notifs.data.map((n) => n.type) : []
    check("notifications is 200", notifs.status === 200, `status ${notifs.status} ${notifs.text.slice(0, 120)}`)
    for (const type of ["message", "follow", "like", "comment"]) {
      check(`has a ${type} notification`, types.includes(type), `types ${types.join(",")}`)
    }
    check("notifications carry the sender", notifs.data?.every?.((n) => n.user?.username === names.b))
    check("liking your own post does not notify you", notifs.data?.filter?.((n) => n.type === "like" && n.postId === postId).length === 1)
    const bNotifs = await api("GET", "/api/notifications", { token: b.token })
    check("mentioned user gets a mention notification", bNotifs.data?.some?.((n) => n.type === "mention" && n.postId === postId))

    const ids = (notifs.data || []).map((n) => n._id)
    const markBad = await api("PATCH", "/api/notifications", { token: a.token, body: { notificationIds: "nope" } })
    check("mark read with bad body is 400", markBad.status === 400, `status ${markBad.status}`)
    const markOther = await api("PATCH", "/api/notifications", { token: b.token, body: { notificationIds: ids } })
    check("marking someone else's notifications changes nothing", markOther.status === 200 && markOther.data?.modified === 0, markOther.text.slice(0, 120))
    const mark = await api("PATCH", "/api/notifications", { token: a.token, body: { notificationIds: ids } })
    check("mark read is 200", mark.status === 200 && mark.data?.modified === ids.length, mark.text.slice(0, 120))
    const after = await api("GET", "/api/notifications", { token: a.token })
    check("notifications are read", after.data?.every?.((n) => n.read === true))

    const noQuery = await api("GET", "/api/search")
    check("search without q is 400", noQuery.status === 400, `status ${noQuery.status}`)
    const users = await api("GET", `/api/search?q=${run}&type=users`)
    check("search finds both users without a token", users.status === 200 && users.data?.users?.length === 2 && users.data?.posts?.length === 0, users.text.slice(0, 160))
    check("search results hide email and password", users.data?.users?.every?.((u) => !("email" in u) && !("password" in u)))
    const posts = await api("GET", `/api/search?q=searchable${run}&type=posts`)
    check("search finds the post by caption", posts.data?.posts?.some?.((p) => p._id === postId && p.caption.includes(`searchable${run}`)))
    const byComment = await api("GET", "/api/search?q=commenting&type=posts")
    check("search finds the post by comment text", byComment.data?.posts?.some?.((p) => p._id === postId))
    const meta = await api("GET", `/api/search?q=${encodeURIComponent("(.*")}`)
    check("regex metacharacters are 200 with no matches", meta.status === 200 && meta.data?.users?.length === 0, `status ${meta.status}`)
  },
  async pwa() {
    const manifestRes = await fetchRaw("/manifest.webmanifest")
    let manifest = null
    try {
      manifest = JSON.parse(manifestRes.text)
    } catch {}
    check("manifest is served", manifestRes.status === 200 && manifest !== null, `status ${manifestRes.status}`)
    check("manifest names the app", manifest?.name === "DevGram" && manifest?.short_name === "DevGram", `${manifest?.name} / ${manifest?.short_name}`)
    check("manifest opens the app standalone at /", manifest?.display === "standalone" && manifest?.start_url === "/", `${manifest?.display} ${manifest?.start_url}`)
    check(
      "manifest sets theme and background colours",
      /^#[0-9a-f]{6}$/i.test(manifest?.theme_color || "") && /^#[0-9a-f]{6}$/i.test(manifest?.background_color || ""),
      `${manifest?.theme_color} ${manifest?.background_color}`,
    )
    const icons = Array.isArray(manifest?.icons) ? manifest.icons : []
    check(
      "manifest lists 192px and 512px icons",
      icons.some((icon) => icon.sizes === "192x192") && icons.some((icon) => icon.sizes === "512x512" && icon.purpose !== "maskable"),
      icons.map((icon) => icon.sizes).join(","),
    )
    check("manifest lists a maskable icon", icons.some((icon) => icon.purpose === "maskable"))
    for (const icon of icons) {
      const res = await fetchRaw(icon.src)
      const size = pngSize(res.buffer)
      check(
        `icon ${icon.src} is a PNG of its declared size`,
        res.status === 200 && size !== null && `${size.width}x${size.height}` === icon.sizes,
        `status ${res.status}, actual ${size ? `${size.width}x${size.height}` : "not a PNG"}, declared ${icon.sizes}`,
      )
    }

    const home = await fetchRaw("/")
    check("pages link the manifest", /<link[^>]+rel="manifest"[^>]+href="\/manifest\.webmanifest"/.test(home.text))
    check("pages set a theme colour", /<meta[^>]+name="theme-color"/.test(home.text))
    const appleHref = home.text.match(/<link[^>]+rel="apple-touch-icon"[^>]+href="([^"]+)"/)?.[1]
    const apple = appleHref ? await fetchRaw(appleHref.replace(/&amp;/g, "&")) : null
    const appleSize = apple ? pngSize(apple.buffer) : null
    check(
      "pages link a 180px Apple touch icon",
      apple?.status === 200 && appleSize?.width === 180 && appleSize?.height === 180,
      `href ${appleHref}, size ${appleSize ? `${appleSize.width}x${appleSize.height}` : "n/a"}`,
    )

    const sw = await fetchRaw("/sw.js")
    check(
      "service worker script is served as JavaScript",
      sw.status === 200 && /javascript/.test(sw.headers.get("content-type") || ""),
      `status ${sw.status}, type ${sw.headers.get("content-type")}`,
    )
    check(
      "service worker script is not cached by the browser",
      /no-cache/.test(sw.headers.get("cache-control") || ""),
      `cache-control ${sw.headers.get("cache-control")}`,
    )
    const offline = await fetchRaw("/offline")
    check("offline page is served", offline.status === 200 && /offline/i.test(offline.text), `status ${offline.status}`)
  },
  async photos() {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.log("  skip photos (BLOB_READ_WRITE_TOKEN is not set)")
      return
    }
    await ensureUsers()
    const { a } = state
    const png = await readFile(PHOTO_FIXTURE)
    const request = (changes = {}) => ({ purpose: "post", contentType: "image/png", size: png.length, ...changes })

    const anon = await api("POST", "/api/uploads/image", { body: request() })
    check("photo upload without token is 401", anon.status === 401, `status ${anon.status}`)
    const heic = await api("POST", "/api/uploads/image", { token: a.token, body: request({ contentType: "image/heic" }) })
    check("HEIC photo is 400", heic.status === 400, `status ${heic.status}`)
    const purpose = await api("POST", "/api/uploads/image", { token: a.token, body: request({ purpose: "banner" }) })
    check("unknown photo purpose is 400", purpose.status === 400, `status ${purpose.status}`)
    const tooBig = await api("POST", "/api/uploads/image", { token: a.token, body: request({ size: 10 * 1024 * 1024 + 1 }) })
    check("photo over 10 MB is 400", tooBig.status === 400, `status ${tooBig.status}`)
    const noSize = await api("POST", "/api/uploads/image", { token: a.token, body: request({ size: "big" }) })
    check("photo size that is not a number is 400", noSize.status === 400, `status ${noSize.status}`)

    const pass = await api("POST", "/api/uploads/image", { token: a.token, body: request() })
    check(
      "photo upload pass points into the caller's post folder",
      pass.status === 200 &&
        typeof pass.data?.token === "string" &&
        pass.data?.pathname?.startsWith(`posts/${a.user.id}/`) &&
        pass.data.pathname.endsWith(".png"),
      `status ${pass.status} ${pass.text.slice(0, 120)}`,
    )
    const avatarPass = await api("POST", "/api/uploads/image", { token: a.token, body: request({ purpose: "avatar" }) })
    check("avatar upload pass points into the caller's avatar folder", avatarPass.data?.pathname?.startsWith(`avatars/${a.user.id}/`))

    const uploaded = await put(pass.data.pathname, png, { access: "public", token: pass.data.token, contentType: "image/png" })
    const served = await fetch(uploaded.url)
    check(
      "the uploaded photo is served as a PNG",
      served.status === 200 && served.headers.get("content-type") === "image/png",
      `status ${served.status} type ${served.headers.get("content-type")}`,
    )
    const { blobs } = await list({ prefix: pass.data.pathname })
    check("the uploaded photo is in the store cleanup uses", blobs.length === 1, "the server uses a different Blob store from .env.local")
    const elsewhere = await put(`posts/${a.user.id}/elsewhere.png`, png, {
      access: "public",
      token: pass.data.token,
      contentType: "image/png",
    }).then(
      () => true,
      () => false,
    )
    check("an upload pass cannot write to another path", !elsewhere)

    const { b } = state
    const post = await api("POST", "/api/posts", { token: a.token, body: { caption: `uploaded photo ${run}`, image: uploaded.url } })
    check("a post can use an uploaded photo", post.status === 201 && post.data?.image === uploaded.url, `status ${post.status}`)
    await api("DELETE", `/api/posts/${post.data?._id}`, { token: a.token })
    check("deleting the post deletes its uploaded photo", !(await blobExists(uploaded.url)))

    const lent = await uploadTestPhoto(a, "post")
    const borrowed = await api("POST", "/api/posts", { token: b.token, body: { caption: `borrowed ${run}`, image: lent } })
    await api("DELETE", `/api/posts/${borrowed.data?._id}`, { token: b.token })
    check("deleting a post that borrowed someone's photo keeps the photo", await blobExists(lent))

    const first = await uploadTestPhoto(a, "avatar")
    const second = await uploadTestPhoto(a, "avatar")
    await api("PATCH", "/api/users/profile", { token: a.token, body: { avatar: first } })
    const replaced = await api("PATCH", "/api/users/profile", { token: a.token, body: { avatar: second } })
    check("a new uploaded profile picture is saved", replaced.status === 200 && replaced.data?.avatar === second, `status ${replaced.status}`)
    check("the old profile picture is deleted", !(await blobExists(first)))
    await api("PATCH", "/api/users/profile", { token: b.token, body: { avatar: second } })
    await api("PATCH", "/api/users/profile", { token: b.token, body: { avatar: "" } })
    check("clearing a borrowed profile picture keeps the owner's file", await blobExists(second))
    const cleared = await api("PATCH", "/api/users/profile", { token: a.token, body: { avatar: "" } })
    check(
      "clearing your own profile picture deletes it",
      cleared.data?.avatar === "/placeholder.svg" && !(await blobExists(second)),
      `avatar ${cleared.data?.avatar}`,
    )
  },

  async videos() {
    if (!process.env.MUX_TOKEN_ID) {
      console.log("  skip videos (MUX_TOKEN_ID is not set)")
      return
    }
    await ensureUsers()
    const { a, b } = state

    const anon = await api("POST", "/api/uploads/video")
    check("video upload without token is 401", anon.status === 401, `status ${anon.status}`)
    const created = await api("POST", "/api/uploads/video", { token: a.token })
    check(
      "video upload is 201 with an upload address",
      created.status === 201 && typeof created.data?.uploadId === "string" && created.data?.url?.startsWith("https://"),
      `status ${created.status} ${created.text.slice(0, 120)}`,
    )
    const { uploadId, url } = created.data
    const otherUser = await api("GET", `/api/uploads/video/${uploadId}`, { token: b.token })
    check("someone else's upload is 404", otherUser.status === 404, `status ${otherUser.status}`)
    const anonStatus = await api("GET", `/api/uploads/video/${uploadId}`)
    check("upload status without token is 401", anonStatus.status === 401, `status ${anonStatus.status}`)
    const malformed = await api("GET", "/api/uploads/video/not-an-upload", { token: a.token })
    check("a malformed upload id is 404", malformed.status === 404, `status ${malformed.status}`)
    const waiting = await api("GET", `/api/uploads/video/${uploadId}`, { token: a.token })
    check("a new upload is still uploading", waiting.data?.status === "uploading", JSON.stringify(waiting.data))

    await putFile(url, CLIP_FIXTURE)
    const ready = await waitForUpload(a, uploadId)
    check("an uploaded clip becomes ready with a playback id", ready.status === "ready" && typeof ready.playbackId === "string", JSON.stringify(ready))
    check("the clip keeps its vertical shape", ready.aspectRatio === "9:16", `aspect ratio ${ready.aspectRatio}`)

    const junk = await api("POST", "/api/uploads/video", { token: a.token })
    await putFile(junk.data.url, NOT_A_VIDEO_FIXTURE)
    const failed = await waitForUpload(a, junk.data.uploadId)
    check("a file that is not a video ends as failed", failed.status === "failed", JSON.stringify(failed))
    // The Free plan keeps few videos, so one that can never be posted is removed.
    const junkAsset = (await new Mux().video.uploads.retrieve(junk.data.uploadId)).asset_id
    check("a video that can never be posted is removed from Mux", typeof junkAsset === "string" && !(await muxAssetExists(junkAsset)))

    state.video = { uploadId, playbackId: ready.playbackId, junkUploadId: junk.data.uploadId }

    const foreign = await api("POST", "/api/posts", { token: b.token, body: { caption: `taken ${run}`, videoUploadId: uploadId } })
    check("posting someone else's video is 404", foreign.status === 404, `status ${foreign.status}`)
    const both = await api("POST", "/api/posts", {
      token: a.token,
      body: { caption: `both ${run}`, videoUploadId: uploadId, video: "https://youtu.be/dQw4w9WgXcQ" },
    })
    check("an uploaded video plus a video link is 400", both.status === 400, `status ${both.status}`)
    const pending = await api("POST", "/api/uploads/video", { token: a.token })
    const early = await api("POST", "/api/posts", { token: a.token, body: { caption: `early ${run}`, videoUploadId: pending.data?.uploadId } })
    check("posting a video that has not been uploaded is 409", early.status === 409, `status ${early.status}`)
    await new Mux().video.uploads.cancel(pending.data.uploadId)
    const junkPost = await api("POST", "/api/posts", { token: a.token, body: { caption: `junk ${run}`, videoUploadId: junk.data.uploadId } })
    check("posting a video Mux could not process is 400", junkPost.status === 400, `status ${junkPost.status}`)

    const videoPost = await api("POST", "/api/posts", { token: a.token, body: { caption: `video post ${run}`, videoUploadId: uploadId } })
    check(
      "posting a ready video is 201 with its playback id and shape",
      videoPost.status === 201 && videoPost.data?.muxVideo?.playbackId === ready.playbackId && videoPost.data?.muxVideo?.aspectRatio === "9:16",
      `status ${videoPost.status} ${videoPost.text.slice(0, 160)}`,
    )
    const again = await api("POST", "/api/posts", { token: a.token, body: { caption: `again ${run}`, videoUploadId: uploadId } })
    check("the same video cannot be posted twice", again.status === 409, `status ${again.status}`)
    const listed = await api("GET", `/api/posts/${videoPost.data?._id}`)
    check("the post page returns the video", listed.data?.muxVideo?.playbackId === ready.playbackId)
    const assetId = videoPost.data?.muxVideo?.assetId
    await api("DELETE", `/api/posts/${videoPost.data?._id}`, { token: a.token })
    check("deleting the post deletes its video from Mux", typeof assetId === "string" && !(await muxAssetExists(assetId)))
  },
}

async function cleanup() {
  const { summary, leftovers } = await removeTestUsers(BASE, Object.values(names))
  console.log(summary)
  check(
    "cleanup removed the test users from the target's database",
    leftovers.length === 0,
    `still there: ${leftovers.join(", ")} -- set SMOKE_DB to the database ${BASE} uses`,
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
    await assertSameDatabase(BASE)
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
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
