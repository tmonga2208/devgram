import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import Post from "@/models/Post"
import { handleRouteError, isValidId, jsonError } from "@/lib/http"

// Posts in the same language, or by the same author.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonError("Post not found", 404)

    await connectToDatabase()

    const current = await Post.findById(id).select("author language").lean()
    if (!current) return jsonError("Post not found", 404)

    const { author, language } = current as { author: { username: string }; language?: string }
    const matches: Array<Record<string, string>> = [{ "author.username": author.username }]
    if (language) matches.push({ language })

    const similarPosts = await Post.find({ _id: { $ne: id }, $or: matches })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean()

    return NextResponse.json(similarPosts)
  } catch (error) {
    return handleRouteError(error, "Similar posts error", "Failed to fetch similar posts")
  }
}
