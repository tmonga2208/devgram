import { NextResponse } from "next/server"
import { connectDB } from "@/lib/db"
import { authMiddleware } from "@/lib/auth"
import type { AuthRequest } from "@/lib/auth"
import Post from "@/models/Post"
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
export async function POST(req: AuthRequest, { params }: { params: { id: string } }) {
  try {
    // Check authentication
    const authResponse = await authMiddleware(req);
    if (authResponse instanceof NextResponse) {
      return authResponse;
    }
    
    await connectDB();
    
    const { content } = await req.json();
    
    if (!content) {
      return NextResponse.json(
        { error: 'Comment content is required' },
        { status: 400 }
      );
    }
    
    const post = await Post.findById(params.id);
    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }
    
    // Create the comment
    const comment = {
      author: req.user?.username,
      content,
      createdAt: new Date()
    };
    
    post.comments.push(comment);
    await post.save();
    
    // Create notification for post author if commenter is not the author
    if (post.author !== req.user?.username) {
      await createNotification(
        req.user?.username || '',
        post.author,
        'comment',
        'commented on your post',
        post._id.toString()
      );
    }
    
    // Check for mentions and create notifications
    const mentions = extractMentions(content);
    for (const mentionedUser of mentions) {
      if (mentionedUser !== req.user?.username && mentionedUser !== post.author) {
        await createNotification(
          req.user?.username || '',
          mentionedUser,
          'mention',
          'mentioned you in a comment',
          post._id.toString()
        );
      }
    }
    
    return NextResponse.json(comment);
  } catch (error) {
    console.error('Add comment error:', error);
    return NextResponse.json(
      { error: 'Failed to add comment' },
      { status: 500 }
    );
  }
}

// Get comments for a post
export async function GET(req: AuthRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    
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