import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import Post from "@/models/Post"
import { getAuthUser } from "@/lib/auth"
import { handleRouteError } from "@/lib/http"
import { toPublicPost } from "@/lib/post-response"
import { DEVBITS_PAGE, shuffled } from "@/lib/post-kinds"

// DevBits for the swipe feed: the newest in a new random order each time, or
// one person's (?user=), newest first.
export async function GET(req: Request) {
  try {
    const user = new URL(req.url).searchParams.get("user")
    const viewer = await getAuthUser(req)
    await connectToDatabase()

    const filter = user ? { kind: "devbit", "author.username": user } : { kind: "devbit" }
    const devbits = await Post.find(filter).sort({ createdAt: -1 }).limit(DEVBITS_PAGE).lean()
    const ordered = user ? devbits : shuffled(devbits)
    return NextResponse.json(ordered.map((post) => toPublicPost(post, viewer)))
  } catch (error) {
    return handleRouteError(error, "DevBits error", "Failed to load DevBits")
  }
}
