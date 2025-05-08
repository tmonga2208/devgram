import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import Post from "@/models/Post"

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase()
    
    // Get the current post
    const currentPost = await Post.findById(params.id)
    if (!currentPost) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }

    // Find similar posts based on content similarity
    const similarPosts = await Post.find({
      _id: { $ne: params.id }, // Exclude current post
      $or: [
        { content: { $regex: currentPost.content, $options: "i" } },
        { caption: { $regex: currentPost.caption, $options: "i" } },
        { language: currentPost.language }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(6)
    .populate("author", "username avatar verified")

    return NextResponse.json(similarPosts)
  } catch (error) {
    console.error("Error fetching similar posts:", error)
    return NextResponse.json(
      { error: "Failed to fetch similar posts" },
      { status: 500 }
    )
  }
} 