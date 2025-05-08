import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Post from '@/models/Post';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import Notification from '@/models/Notification';

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
    console.error('Error in POST /api/posts/[id]/like:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 