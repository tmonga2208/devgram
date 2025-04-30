import { NextResponse } from "next/server"
import { connectDB } from "@/lib/db"
import { authMiddleware } from "@/lib/auth"
import Notification from "@/models/Notification"
import User from "@/models/User"
import { Types } from "mongoose"

// Define types for lean results
interface LeanNotification {
  _id: Types.ObjectId;
  sender: string;
  recipient: string;
  type: 'like' | 'comment' | 'follow' | 'message' | 'mention';
  content: string;
  postId?: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface LeanUser {
  _id: Types.ObjectId;
  username: string;
  avatar: string;
}

// Get all notifications for the current user
export async function GET(request: Request) {
  try {
    const user = await authMiddleware(request)
    if (!user || !('username' in user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await connectDB()

    // Fetch notifications for the current user
    const notifications = await Notification.find({ recipient: user.username })
      .sort({ createdAt: -1 })
      .lean()

    // Get unique sender usernames
    const senderUsernames = [...new Set(notifications.map((n: LeanNotification) => n.sender))]

    // Fetch sender details
    const senders = await User.find(
      { username: { $in: senderUsernames } },
      { username: 1, avatar: 1 }
    ).lean()

    // Create a map of sender details
    const senderMap = new Map(
      senders.map((sender: LeanUser) => [sender.username, sender])
    )

    // Enrich notifications with sender details
    const enrichedNotifications = notifications.map((notification: LeanNotification) => ({
      ...notification,
      _id: notification._id.toString(),
      user: senderMap.get(notification.sender) || {
        username: "Unknown User",
        avatar: "/placeholder.svg"
      }
    }))

    return NextResponse.json(enrichedNotifications)
  } catch (error) {
    console.error("Error fetching notifications:", error)
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    )
  }
}

// Mark notifications as read
export async function PATCH(request: Request) {
  try {
    const user = await authMiddleware(request)
    if (!user || !('username' in user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { notificationIds } = await request.json()
    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return NextResponse.json(
        { error: "Invalid notification IDs" },
        { status: 400 }
      )
    }

    await connectDB()

    // Update notifications
    const result = await Notification.updateMany(
      {
        _id: { $in: notificationIds },
        recipient: user.username // Ensure user can only mark their own notifications as read
      },
      { $set: { read: true } }
    )

    if (result.modifiedCount === 0) {
      return NextResponse.json(
        { error: "No notifications found or already marked as read" },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error marking notifications as read:", error)
    return NextResponse.json(
      { error: "Failed to mark notifications as read" },
      { status: 500 }
    )
  }
} 