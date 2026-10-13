import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import { getAuthUser } from "@/lib/auth"
import { handleRouteError, jsonError } from "@/lib/http"
import { toPublicPost } from "@/lib/post-response"
import { escapeRegex } from "@/lib/regex"
import User from "@/models/User"
import Post from "@/models/Post"

// Public search over users and posts. type is 'all', 'users' or 'posts'.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const query = (url.searchParams.get("q") || "").trim().slice(0, 100)
    const type = url.searchParams.get("type") || "all"

    if (!query) return jsonError("Search query is required", 400)

    const viewer = await getAuthUser(req)
    await connectToDatabase()

    const searchRegex = new RegExp(escapeRegex(query), "i")
    const results: { users: unknown[]; posts: unknown[] } = { users: [], posts: [] }

    if (type === "all" || type === "users") {
      results.users = await User.find({ $or: [{ username: searchRegex }, { fullName: searchRegex }] })
        .select("username fullName avatar bio")
        .limit(10)
        .lean()
    }

    if (type === "all" || type === "posts") {
      const posts = await Post.find({
        $or: [{ caption: searchRegex }, { "author.username": searchRegex }, { "comments.text": searchRegex }],
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
      results.posts = posts.map((post) => toPublicPost(post, viewer))
    }

    return NextResponse.json(results)
  } catch (error) {
    return handleRouteError(error, "Search error", "Failed to perform search")
  }
}
