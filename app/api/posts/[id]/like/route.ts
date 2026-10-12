import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Post from '@/models/Post';
import { requireAuth } from '@/lib/auth';
import { handleRouteError, isValidId, jsonError } from '@/lib/http';
import { createNotification } from '@/lib/notifications';

// Toggle the caller's like. Each branch is one atomic update, so racing
// requests cannot double-count.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    if (!isValidId(id)) return jsonError('Post not found', 404);

    await connectToDatabase();

    const liked = await Post.findOneAndUpdate(
      { _id: id, likedBy: { $ne: auth.username } },
      { $addToSet: { likedBy: auth.username }, $inc: { likes: 1 } },
      { new: true }
    );
    if (liked) {
      await createNotification(auth.username, liked.author.username, 'like', 'liked your post', String(liked._id));
      return NextResponse.json(liked);
    }

    const unliked = await Post.findOneAndUpdate(
      { _id: id, likedBy: auth.username },
      { $pull: { likedBy: auth.username }, $inc: { likes: -1 } },
      { new: true }
    );
    if (unliked) return NextResponse.json(unliked);

    return jsonError('Post not found', 404);
  } catch (error) {
    return handleRouteError(error, 'Like post error', 'Failed to update like');
  }
}
