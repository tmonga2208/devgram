import { NextResponse } from "next/server"
import { connectDB } from "@/lib/db"
import { authMiddleware } from "@/lib/auth"
import type { AuthRequest } from "@/lib/auth"
import Message from "@/models/Message"
import Notification from "@/models/Notification"

// Helper function to create a notification
async function createNotification(sender: string, recipient: string, type: 'like' | 'comment' | 'follow' | 'message' | 'mention', content: string, postId?: string) {
  await Notification.create({
    sender,
    recipient,
    type,
    content,
    postId,
    read: false
  });
}

// Get all conversations for the current user
export async function GET(req: AuthRequest) {
  try {
    // Check authentication
    const authResponse = await authMiddleware(req);
    if (authResponse instanceof NextResponse) {
      return authResponse;
    }
    
    await connectDB();
    
    // Find all conversations where the current user is either the sender or receiver
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: req.user?.username },
            { receiver: req.user?.username }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$sender", req.user?.username] },
              "$receiver",
              "$sender"
            ]
          },
          lastMessage: { $first: "$$ROOT" }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "username",
          as: "user"
        }
      },
      {
        $unwind: "$user"
      },
      {
        $project: {
          _id: 0,
          username: "$user.username",
          avatar: "$user.avatar",
          lastMessage: {
            content: "$lastMessage.content",
            timestamp: "$lastMessage.createdAt",
            sender: "$lastMessage.sender"
          }
        }
      }
    ]);
    
    return NextResponse.json(conversations);
  } catch (error) {
    console.error('Get conversations error:', error);
    return NextResponse.json(
      { error: 'Failed to get conversations' },
      { status: 500 }
    );
  }
}

// Send a new message
export async function POST(req: AuthRequest) {
  try {
    // Check authentication
    const authResponse = await authMiddleware(req);
    if (authResponse instanceof NextResponse) {
      return authResponse;
    }
    
    await connectDB();
    
    const { receiver, content } = await req.json();
    
    if (!receiver || !content) {
      return NextResponse.json(
        { error: 'Receiver and content are required' },
        { status: 400 }
      );
    }
    
    // Create the message
    const message = await Message.create({
      sender: req.user?.username,
      receiver,
      content
    });
    
    // Create a notification for the receiver
    await createNotification(
      req.user?.username || '',
      receiver,
      'message',
      'sent you a message'
    );
    
    return NextResponse.json(message);
  } catch (error) {
    console.error('Send message error:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
} 