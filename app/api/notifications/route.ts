import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import { requireAuth } from "@/lib/auth"
import { handleRouteError, isValidId, jsonError, readJson } from "@/lib/http"
import Notification from "@/models/Notification"
import User from "@/models/User"

interface LeanNotification {
  _id: { toString(): string }
  sender: string
  [key: string]: unknown
}

interface LeanSender {
  username: string
  avatar?: string
}

// Get all notifications for the current user, newest first
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    await connectToDatabase()

    const notifications = (await Notification.find({ recipient: auth.username })
      .sort({ createdAt: -1 })
      .lean()) as unknown as LeanNotification[]

    const senderUsernames = [...new Set(notifications.map((notification) => notification.sender))]
    const senders = (await User.find({ username: { $in: senderUsernames } })
      .select("username avatar")
      .lean()) as unknown as LeanSender[]
    const senderMap = new Map(senders.map((sender) => [sender.username, sender]))

    return NextResponse.json(
      notifications.map((notification) => {
        const sender = senderMap.get(notification.sender)
        return {
          ...notification,
          _id: notification._id.toString(),
          user: {
            username: sender?.username || notification.sender,
            avatar: sender?.avatar || "/placeholder.svg",
          },
        }
      })
    )
  } catch (error) {
    return handleRouteError(error, "Fetch notifications error", "Failed to fetch notifications")
  }
}

// Mark the caller's notifications as read
export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const body = await readJson(req)
    const ids = body?.notificationIds
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string" && isValidId(id))) {
      return jsonError("Invalid notification IDs", 400)
    }

    await connectToDatabase()

    const result = await Notification.updateMany(
      { _id: { $in: ids }, recipient: auth.username },
      { $set: { read: true } }
    )

    return NextResponse.json({ success: true, modified: result.modifiedCount })
  } catch (error) {
    return handleRouteError(error, "Mark notifications error", "Failed to mark notifications as read")
  }
}
