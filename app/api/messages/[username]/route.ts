import { NextResponse } from "next/server"
import { connectDB } from "@/lib/db"
import { authMiddleware } from "@/lib/auth"
import type { AuthRequest } from "@/lib/auth"
import Message from "@/models/Message"

// Get messages in a conversation with a specific user
export async function GET(
  req: AuthRequest,
  { params }: { params: { username: string } }
) {
  try {
    // Check authentication
    const authResponse = await authMiddleware(req);
    if (authResponse instanceof NextResponse) {
      return authResponse;
    }
    
    await connectDB();
    
    const messages = await Message.find({
      $or: [
        { sender: req.user?.username, receiver: params.username },
        { sender: params.username, receiver: req.user?.username }
      ]
    }).sort({ createdAt: 1 });
    
    return NextResponse.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    return NextResponse.json(
      { error: 'Failed to get messages' },
      { status: 500 }
    );
  }
} 