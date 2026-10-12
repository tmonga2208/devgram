import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Post from '@/models/Post';
import { requireAuth } from '@/lib/auth';
import { handleRouteError, isValidId, jsonError } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };

// Get a single post
export async function GET(_req: Request, { params }: Context) {
  try {
    const { id } = await params;
    if (!isValidId(id)) return jsonError('Post not found', 404);

    await connectToDatabase();
    const post = await Post.findById(id).lean();
    if (!post) return jsonError('Post not found', 404);

    return NextResponse.json(post);
  } catch (error) {
    return handleRouteError(error, 'Fetch post error', 'Failed to fetch post');
  }
}

// Delete a post (author only)
export async function DELETE(req: Request, { params }: Context) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    if (!isValidId(id)) return jsonError('Post not found', 404);

    await connectToDatabase();
    const post = await Post.findById(id);
    if (!post) return jsonError('Post not found', 404);
    if (post.author.username !== auth.username) return jsonError('Not authorized', 403);

    await post.deleteOne();
    return NextResponse.json({ message: 'Post deleted successfully' });
  } catch (error) {
    return handleRouteError(error, 'Delete post error', 'Failed to delete post');
  }
}
