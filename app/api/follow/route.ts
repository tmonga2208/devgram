import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import Follow from "@/models/Follow"
import User from "@/models/User"
import { connectDB } from "@/lib/db"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { userId } = await req.json()
    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    await connectDB()

    // Check if user exists
    const userToFollow = await User.findById(userId)
    if (!userToFollow) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check if already following
    const existingFollow = await Follow.findOne({
      follower: session.user.id,
      following: userId
    })

    if (existingFollow) {
      // Unfollow
      await Follow.deleteOne({ _id: existingFollow._id })
      return NextResponse.json({ message: "Unfollowed successfully" })
    } else {
      // Follow
      await Follow.create({
        follower: session.user.id,
        following: userId
      })
      return NextResponse.json({ message: "Followed successfully" })
    }
  } catch (error) {
    console.error("Follow error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await connectDB()

    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("userId")

    if (userId) {
      // Check if current user is following the specified user
      const isFollowing = await Follow.findOne({
        follower: session.user.id,
        following: userId
      })
      return NextResponse.json({ isFollowing: !!isFollowing })
    } else {
      // Get all users that the current user is following
      const following = await Follow.find({ follower: session.user.id })
        .populate("following", "username name profilePicture")
        .sort({ createdAt: -1 })

      return NextResponse.json({ following })
    }
  } catch (error) {
    console.error("Get follows error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 