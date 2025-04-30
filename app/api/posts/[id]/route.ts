import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Post from '@/models/Post';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import Notification from '@/models/Notification';

// Get a single post
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();
    
    const post = await Post.findById(params.id);
    
    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(post);
  } catch (error) {
    console.error('Fetch post error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch post' },
      { status: 500 }
    );
  }
}

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

// Update a post (like, save, add comment)
export async function PATCH(
  req: AuthRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const authResponse = await authMiddleware(req);
    if (authResponse instanceof NextResponse) {
      return authResponse;
    }
    
    await connectDB();
    
    const { action, comment } = await req.json();
    
    const post = await Post.findById(params.id);
    
    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }
    
    switch (action) {
      case 'like':
        post.liked = !post.liked;
        post.likes += post.liked ? 1 : -1;
        
        // Create notification for like
        if (post.liked && req.user?.username !== post.author.username) {
          await createNotification(
            req.user?.username || '',
            post.author.username,
            'like',
            'liked your post',
            post._id.toString()
          );
        }
        break;
      case 'save':
        post.saved = !post.saved;
        break;
      case 'comment':
        if (comment) {
          post.comments.push({
            username: req.user?.username,
            avatar: '/placeholder.svg?height=150&width=150',
            text: comment,
            likes: 0,
            createdAt: new Date(),
          });
          
          // Create notification for comment
          if (req.user?.username !== post.author.username) {
            await createNotification(
              req.user?.username || '',
              post.author.username,
              'comment',
              'commented on your post',
              post._id.toString()
            );
          }
        }
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
    
    await post.save();
    
    return NextResponse.json(post);
  } catch (error) {
    console.error('Update post error:', error);
    return NextResponse.json(
      { error: 'Failed to update post' },
      { status: 500 }
    );
  }
}

// Delete a post
export async function DELETE(
  req: AuthRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const authResponse = await authMiddleware(req);
    if (authResponse instanceof NextResponse) {
      return authResponse;
    }
    
    await connectDB();
    
    const post = await Post.findById(params.id);
    
    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }
    
    // Check if user is the author
    if (post.author.username !== req.user?.username) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }
    
    await post.deleteOne();
    
    return NextResponse.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    return NextResponse.json(
      { error: 'Failed to delete post' },
      { status: 500 }
    );
  }
} 