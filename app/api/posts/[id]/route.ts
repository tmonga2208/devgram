import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Post from '@/models/Post';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import Notification from '@/models/Notification';

// Get a single post
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase();
    
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
    
    await connectToDatabase();
    
    const { action, comment } = await req.json();
    const postId = params.id;
    
    const post = await Post.findById(postId);
    
    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    // Ensure likedBy exists
    if (!post.likedBy) {
      post.likedBy = [];
    }
    
    switch (action) {
      case 'like':
        const userId = req.user?.username;
        if (!userId) {
          return NextResponse.json(
            { error: 'User not authenticated' },
            { status: 401 }
          );
        }

        // Ensure likedBy is an array and remove any duplicates
        if (!Array.isArray(post.likedBy)) {
          post.likedBy = [];
        }
        post.likedBy = [...new Set(post.likedBy)];

        const hasLiked = post.likedBy.includes(userId);
        if (hasLiked) {
          // Unlike
          post.likedBy = post.likedBy.filter((id: string) => id !== userId);
          post.likes = Math.max(0, post.likes - 1);
        } else {
          // Like
          post.likedBy.push(userId);
          post.likes += 1;
          
          // Create notification for like
          if (userId !== post.author.username) {
            await createNotification(
              userId,
              post.author.username,
              'like',
              'liked your post',
              post._id.toString()
            );
          }
        }

        await post.save();
        
        // Return the updated post with the correct liked status
        const updatedPost = {
          ...post.toObject(),
          liked: post.likedBy.includes(userId),
          likes: post.likes,
          likedBy: post.likedBy
        };
        
        return NextResponse.json(updatedPost);
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
    
    await connectToDatabase();
    
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

export async function POST(
  request: AuthRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const authResponse = await authMiddleware(request);
    if (authResponse instanceof NextResponse) {
      return authResponse;
    }

    await connectToDatabase();
    
    const post = await Post.findById(params.id);
    if (!post) {
      return new NextResponse('Post not found', { status: 404 });
    }

    // Handle like/unlike
    const isLiked = post.likedBy.includes(request.user?.username || '');
    const updatedLikedBy = isLiked
      ? post.likedBy.filter((username: string) => username !== request.user?.username)
      : [...post.likedBy, request.user?.username];

    const updatedPost = await Post.findByIdAndUpdate(
      params.id,
      {
        $set: {
          likes: isLiked ? post.likes - 1 : post.likes + 1,
          likedBy: updatedLikedBy
        }
      },
      { new: true }
    ).populate('author');

    // Create notification if someone else liked the post
    if (!isLiked && post.author.username !== request.user?.username) {
      await Notification.create({
        sender: request.user?.username,
        recipient: post.author.username,
        type: 'like',
        content: 'liked your post',
        postId: post._id,
        read: false
      });
    }

    return NextResponse.json(updatedPost);
  } catch (error) {
    console.error('Error in POST /api/posts/[id]:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 