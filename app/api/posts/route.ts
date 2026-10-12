import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Post from '@/models/Post';
import User from '@/models/User';
import { requireAuth } from '@/lib/auth';
import { handleRouteError, isHttpUrl, jsonError, readJson } from '@/lib/http';
import { notifyMentions } from '@/lib/notifications';

// Get all posts, newest first
export async function GET() {
  try {
    await connectToDatabase();
    const posts = await Post.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json(posts);
  } catch (error) {
    return handleRouteError(error, 'Get posts error', 'Failed to get posts');
  }
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// Create a new post
export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const body = await readJson(req);
    if (!body) return jsonError('Invalid request body', 400);

    const caption = optionalString(body.caption);
    if (!caption) return jsonError('Caption is required for posts', 400);

    const image = optionalString(body.image);
    const video = optionalString(body.video);
    // Code keeps its own whitespace, so it is not trimmed.
    const code = typeof body.code === 'string' && body.code.trim() ? body.code : undefined;
    const language = optionalString(body.language);

    if (image && !isHttpUrl(image)) return jsonError('Image must be an http(s) URL', 400);
    if (video && !isHttpUrl(video)) return jsonError('Video must be an http(s) URL', 400);

    await connectToDatabase();

    const author = await User.findOne({ username: auth.username }).select('username avatar').lean();
    if (!author) return jsonError('Authentication required', 401);

    const post = await Post.create({
      author: {
        username: auth.username,
        avatar: (author as { avatar?: string }).avatar || '/placeholder.svg',
      },
      caption,
      image,
      video,
      code,
      language: code ? language : undefined,
    });

    await notifyMentions(auth.username, caption, 'mentioned you in a post', String(post._id));

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Create post error', 'Failed to create post');
  }
}
