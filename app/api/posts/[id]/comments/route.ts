import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import Post from "@/models/Post"
import User from "@/models/User"
import { requireAuth } from "@/lib/auth"
import { handleRouteError, isValidId, jsonError, readJson } from "@/lib/http"
import { createNotification, notifyMentions } from "@/lib/notifications"

type Context = { params: Promise<{ id: string }> }

// Add a comment to a post
export async function POST(req: Request, { params }: Context) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    if (!isValidId(id)) return jsonError("Post not found", 404)

    const body = await readJson(req)
    const text = typeof body?.text === "string" ? body.text.trim() : ""
    if (!text) return jsonError("Comment text is required", 400)
    if (text.length > 1000) return jsonError("Comment must be 1000 characters or fewer", 400)

    await connectToDatabase()

    const commenter = await User.findOne({ username: auth.username }).select("avatar").lean()
    if (!commenter) return jsonError("Authentication required", 401)

    const post = await Post.findByIdAndUpdate(
      id,
      {
        $push: {
          comments: {
            username: auth.username,
            avatar: (commenter as { avatar?: string }).avatar || "/placeholder.svg",
            text,
          },
        },
      },
      { new: true }
    )
    if (!post) return jsonError("Post not found", 404)

    const comment = post.comments[post.comments.length - 1]
    const author = post.author.username
    const postId = String(post._id)

    await createNotification(auth.username, author, "comment", "commented on your post", postId)
    await notifyMentions(auth.username, text, "mentioned you in a comment", postId, [author])

    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    return handleRouteError(error, "Add comment error", "Failed to add comment")
  }
}

// Get comments for a post
export async function GET(_req: Request, { params }: Context) {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonError("Post not found", 404)

    await connectToDatabase()
    const post = await Post.findById(id).select("comments").lean()
    if (!post) return jsonError("Post not found", 404)

    return NextResponse.json((post as { comments?: unknown[] }).comments || [])
  } catch (error) {
    return handleRouteError(error, "Get comments error", "Failed to get comments")
  }
}
