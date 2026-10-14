// The accounts a check creates through the target's API are removed straight
// from MongoDB afterwards. That only works when this script looks in the same
// database the target writes to: MONGODB_URI names it, and SMOKE_DB overrides
// the name when the target uses another one (production, for example).
import { del, list } from "@vercel/blob"
import mongoose from "mongoose"

async function withDatabase(work) {
  const dbName = process.env.SMOKE_DB
  await mongoose.connect(process.env.MONGODB_URI, dbName ? { dbName } : {})
  try {
    return await work(mongoose.connection)
  } finally {
    await mongoose.disconnect()
  }
}

// Refuses to start when the target's newest post is missing from the database
// cleanup would use, because the test accounts would be stranded in the
// target's real one. A target with no posts cannot be compared and passes.
export async function assertSameDatabase(baseUrl) {
  let res
  try {
    res = await fetch(`${baseUrl}/api/posts`)
  } catch (error) {
    throw new Error(`Cannot reach ${baseUrl} (${error.cause?.code || error.message}). Is the server running?`)
  }
  const posts = res.ok ? await res.json().catch(() => null) : null
  const id = Array.isArray(posts) ? posts[0]?._id : null
  if (!id) return

  const { found, name } = await withDatabase(async (db) => ({
    found: await db.collection("posts").findOne({ _id: new mongoose.Types.ObjectId(id) }),
    name: db.name,
  }))
  if (!found) {
    throw new Error(
      `${baseUrl} does not write to the "${name}" database, so cleanup would miss the test accounts. ` +
        "Set SMOKE_DB to the database that server uses.",
    )
  }
}

// The test users' uploaded photos live in their own folders (lib/media-rules.ts).
async function removeTestFiles(userIds) {
  if (!process.env.BLOB_READ_WRITE_TOKEN || userIds.length === 0) return 0
  let removed = 0
  for (const id of userIds) {
    for (const prefix of [`posts/${id}/`, `avatars/${id}/`]) {
      const { blobs } = await list({ prefix, limit: 1000 })
      if (blobs.length > 0) {
        await del(blobs.map((blob) => blob.url))
        removed += blobs.length
      }
    }
  }
  return removed
}

// Deletes exactly the named users and everything they authored, sent or
// received, then asks the target whether it still serves any of them.
export async function removeTestUsers(baseUrl, usernames) {
  const { removed, name, userIds } = await withDatabase(async (db) => {
    const users = await db
      .collection("users")
      .find({ username: { $in: usernames } }, { projection: { _id: 1 } })
      .toArray()
    return {
      userIds: users.map((user) => String(user._id)),
      removed: {
        posts: await db.collection("posts").deleteMany({ "author.username": { $in: usernames } }),
        messages: await db
          .collection("messages")
          .deleteMany({ $or: [{ sender: { $in: usernames } }, { receiver: { $in: usernames } }] }),
        notifications: await db
          .collection("notifications")
          .deleteMany({ $or: [{ sender: { $in: usernames } }, { recipient: { $in: usernames } }] }),
        users: await db.collection("users").deleteMany({ username: { $in: usernames } }),
      },
      name: db.name,
    }
  })
  const files = await removeTestFiles(userIds)

  const leftovers = []
  for (const username of usernames) {
    const res = await fetch(`${baseUrl}/api/users/${username}`)
    if (res.status !== 404) leftovers.push(username)
  }

  return {
    summary: `cleanup (${name}): ${Object.entries(removed)
      .map(([key, value]) => `${key}=${value.deletedCount}`)
      .join(" ")} files=${files}`,
    leftovers,
  }
}
