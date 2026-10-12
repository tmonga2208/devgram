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
  async posts() {
    await ensureUsers()
    const { a, b } = state
    const missingId = "0123456789abcdef01234567"

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

    const edit = await api("PATCH", "/api/users/profile", {
      token: a.token,
      body: { fullName: "Smoke Edited", bio: "hello", website: "https://example.com", avatar: "https://example.com/me.png" },
    })
    check(
      "profile edit is 200 and applied",
      edit.status === 200 && edit.data?.fullName === "Smoke Edited" && edit.data?.bio === "hello" && edit.data?.website === "https://example.com" && edit.data?.avatar === "https://example.com/me.png",
      `status ${edit.status} ${edit.text.slice(0, 120)}`,
    )
    const clear = await api("PATCH", "/api/users/profile", { token: a.token, body: { bio: "", website: "", avatar: "" } })
    check("bio and website can be cleared", clear.data?.bio === "" && clear.data?.website === "")
    check("clearing avatar restores the placeholder", clear.data?.avatar === "/placeholder.svg")
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
