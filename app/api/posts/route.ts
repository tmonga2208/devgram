import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Post from '@/models/Post';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import Notification from '@/models/Notification';

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

// Get all posts
export async function GET(req: AuthRequest) {
  try {
    await connectDB();
    
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate('author', 'username avatar')
      .lean();
    
    return NextResponse.json(posts);
  } catch (error) {
    console.error('Get posts error:', error);
    return NextResponse.json(
      { error: 'Failed to get posts' },
      { status: 500 }
    );
  }
}

// Create a new post
export async function POST(req: AuthRequest) {
  try {
    // Check authentication
    const authResponse = await authMiddleware(req);
    if (authResponse instanceof NextResponse) {
      return authResponse;
    }
    
    await connectDB();
    
    const { content, image } = await req.json();
    
    if (!content && !image) {
      return NextResponse.json(
        { error: 'Post must have either content or image' },
        { status: 400 }
      );
    }
    
    // Create the post
    const post = await Post.create({
      author: req.user?.username,
      content,
      image
    });
    
    // Check for mentions and create notifications
    if (content) {
      const mentions = extractMentions(content);
      for (const mentionedUser of mentions) {
        if (mentionedUser !== req.user?.username) {
          await createNotification(
            req.user?.username || '',
            mentionedUser,
            'mention',
            'mentioned you in a post',
            post._id.toString()
          );
        }
      }
    }
    
    return NextResponse.json(post);
  } catch (error) {
    console.error('Create post error:', error);
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    );
  }
} 