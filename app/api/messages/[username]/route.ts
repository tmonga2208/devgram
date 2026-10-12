import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import { requireAuth } from "@/lib/auth"
import { handleRouteError } from "@/lib/http"
import Message from "@/models/Message"

// Get messages in a conversation with a specific user, oldest first
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { username } = await params

    await connectToDatabase()

    const messages = await Message.find({
      $or: [
        { sender: auth.username, receiver: username },
        { sender: username, receiver: auth.username },
      ],
    })
      .sort({ createdAt: 1 })
      .lean()

    return NextResponse.json(messages)
  } catch (error) {
    return handleRouteError(error, "Get messages error", "Failed to get messages")
  }
}
