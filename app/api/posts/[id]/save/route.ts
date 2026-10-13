import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Post from '@/models/Post';
import { requireAuth } from '@/lib/auth';
import { handleRouteError, isValidId, jsonError } from '@/lib/http';
import { toPublicPost } from '@/lib/post-response';

// Toggle the caller's save.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    if (!isValidId(id)) return jsonError('Post not found', 404);

    await connectToDatabase();

    const saved = await Post.findOneAndUpdate(
      { _id: id, savedBy: { $ne: auth.username } },
      { $addToSet: { savedBy: auth.username } },
      { new: true }
    );
    if (saved) return NextResponse.json(toPublicPost(saved, auth));

    const unsaved = await Post.findOneAndUpdate(
      { _id: id, savedBy: auth.username },
      { $pull: { savedBy: auth.username } },
      { new: true }
    );
    if (unsaved) return NextResponse.json(toPublicPost(unsaved, auth));

    return jsonError('Post not found', 404);
  } catch (error) {
    return handleRouteError(error, 'Save post error', 'Failed to update save');
  }
}
