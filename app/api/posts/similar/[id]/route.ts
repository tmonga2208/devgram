import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import Post from "@/models/Post"
import { getAuthUser } from "@/lib/auth"
import { handleRouteError, isValidId, jsonError } from "@/lib/http"
import { toPublicPost } from "@/lib/post-response"

const SIMILAR_LIMIT = 6

// Posts in the same language come first. If they do not fill the list, the
// author's other posts make up the rest.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonError("Post not found", 404)

    const viewer = await getAuthUser(req)
    await connectToDatabase()

    const current = await Post.findById(id).select("author language").lean()
    if (!current) return jsonError("Post not found", 404)

    const { author, language } = current as { author: { username: string }; language?: string }

    const sameLanguage = language
      ? await Post.find({ _id: { $ne: id }, language }).sort({ createdAt: -1 }).limit(SIMILAR_LIMIT).lean()
      : []
    const taken = [id, ...sameLanguage.map((post) => String(post._id))]
    const sameAuthor =
      sameLanguage.length < SIMILAR_LIMIT
        ? await Post.find({ _id: { $nin: taken }, "author.username": author.username })
            .sort({ createdAt: -1 })
            .limit(SIMILAR_LIMIT - sameLanguage.length)
            .lean()
        : []

    return NextResponse.json([...sameLanguage, ...sameAuthor].map((post) => toPublicPost(post, viewer)))
  } catch (error) {
    return handleRouteError(error, "Similar posts error", "Failed to fetch similar posts")
  }
}
