import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import User from "@/models/User"
import { requireAuth } from "@/lib/auth"
import { handleRouteError, jsonError } from "@/lib/http"
import { createNotification } from "@/lib/notifications"

// Toggle whether the caller follows :username.
export async function POST(req: Request, { params }: { params: Promise<{ username: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { username: targetUsername } = await params
    if (targetUsername === auth.username) return jsonError("You cannot follow yourself", 400)

    await connectToDatabase()

    const target = await User.findOne({ username: targetUsername }).select("_id").lean()
    if (!target) return jsonError("User not found", 404)
    const targetId = (target as { _id: unknown })._id

    let following: boolean
    const followed = await User.updateOne(
      { username: auth.username, following: { $ne: targetId } },
      { $addToSet: { following: targetId }, $inc: { followingCount: 1 } }
    )

    if (followed.modifiedCount === 1) {
      await User.updateOne({ _id: targetId }, { $inc: { followers: 1 } })
      await createNotification(auth.username, targetUsername, "follow", "started following you")
      following = true
    } else {
      const unfollowed = await User.updateOne(
        { username: auth.username, following: targetId },
        { $pull: { following: targetId }, $inc: { followingCount: -1 } }
      )
      if (unfollowed.modifiedCount !== 1) return jsonError("Authentication required", 401)
      await User.updateOne({ _id: targetId, followers: { $gt: 0 } }, { $inc: { followers: -1 } })
      following = false
    }

    const [updatedTarget, updatedSelf] = await Promise.all([
      User.findById(targetId).select("followers").lean(),
      User.findOne({ username: auth.username }).select("followingCount").lean(),
    ])

    return NextResponse.json({
      following,
      followers: (updatedTarget as { followers?: number } | null)?.followers || 0,
      followingCount: (updatedSelf as { followingCount?: number } | null)?.followingCount || 0,
    })
  } catch (error) {
    return handleRouteError(error, "Follow/unfollow error", "Failed to follow/unfollow user")
  }
}
