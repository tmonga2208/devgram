import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import { requireAuth } from "@/lib/auth"
import { LIMITS, handleRouteError, jsonError, readJson } from "@/lib/http"
import { createNotification } from "@/lib/notifications"
import Message from "@/models/Message"
import User from "@/models/User"

// Get all conversations for the current user, most recent first
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    await connectToDatabase()

    const conversations = await Message.aggregate([
      { $match: { $or: [{ sender: auth.username }, { receiver: auth.username }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { $cond: [{ $eq: ["$sender", auth.username] }, "$receiver", "$sender"] },
          lastMessage: { $first: "$$ROOT" },
        },
      },
      { $lookup: { from: "users", localField: "_id", foreignField: "username", as: "user" } },
      { $unwind: "$user" },
      { $sort: { "lastMessage.createdAt": -1 } },
      {
        $project: {
          _id: 0,
          username: "$user.username",
          avatar: "$user.avatar",
          lastMessage: {
            content: "$lastMessage.content",
            timestamp: "$lastMessage.createdAt",
            sender: "$lastMessage.sender",
          },
        },
      },
    ])

    return NextResponse.json(conversations)
  } catch (error) {
    return handleRouteError(error, "Get conversations error", "Failed to get conversations")
  }
}

// Send a new message
export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const body = await readJson(req)
    const receiver = typeof body?.receiver === "string" ? body.receiver.trim() : ""
    const content = typeof body?.content === "string" ? body.content.trim() : ""

    if (!receiver || !content) return jsonError("Receiver and content are required", 400)
    if (content.length > LIMITS.message) return jsonError(`Message must be ${LIMITS.message} characters or fewer`, 400)
    if (receiver === auth.username) return jsonError("You cannot message yourself", 400)

    await connectToDatabase()

    if (!(await User.exists({ username: receiver }))) return jsonError("User not found", 404)

    const message = await Message.create({ sender: auth.username, receiver, content })
    await createNotification(auth.username, receiver, "message", "sent you a message")

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    return handleRouteError(error, "Send message error", "Failed to send message")
  }
}
