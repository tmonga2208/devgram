import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import Post from "@/models/Post"
import { getToken } from "next-auth/jwt"
import { NextRequest } from "next/server"
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

// Helper function to extract mentions from text
function extractMentions(text: string): string[] {
  const mentionRegex = /@(\w+)/g;
  const matches = text.match(mentionRegex);
  return matches ? matches.map(match => match.slice(1)) : [];
}

// Add a comment to a post
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = await getToken({ req: request })
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await connectToDatabase()
    
    const { text } = await request.json()
    if (!text) {
      return NextResponse.json(
        { error: "Comment text is required" },
        { status: 400 }
      )
    }

    const post = await Post.findById(params.id)
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }

    const comment = {
      username: token.username as string,
      avatar: token.avatar as string,
      text,
      likes: 0,
      createdAt: new Date().toISOString(),
    }

    post.comments.push(comment)
    await post.save()

    // Create notification for post author if commenter is not the author
    if (post.author !== token.username) {
      await createNotification(
        token.username,
        post.author,
        'comment',
        'commented on your post',
        post._id.toString()
      );
    }
    
    // Check for mentions and create notifications
    const mentions = extractMentions(text);
    for (const mentionedUser of mentions) {
      if (mentionedUser !== token.username && mentionedUser !== post.author) {
        await createNotification(
          token.username,
          mentionedUser,
          'mention',
          'mentioned you in a comment',
          post._id.toString()
        );
      }
    }

    return NextResponse.json(comment)
  } catch (error) {
    console.error("Error adding comment:", error)
    return NextResponse.json(
      { error: "Failed to add comment" },
      { status: 500 }
    )
  }
}

// Get comments for a post
export async function GET(req: AuthRequest, { params }: { params: { id: string } }) {
  try {
    await connectToDatabase();
    
    const post = await Post.findById(params.id);
    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(post.comments);
  } catch (error) {
    console.error('Get comments error:', error);
    return NextResponse.json(
      { error: 'Failed to get comments' },
      { status: 500 }
    );
  }
} 