import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Post from '@/models/Post';
import User from '@/models/User';
import { getAuthUser, requireAuth } from '@/lib/auth';
import { LIMITS, handleRouteError, isHttpUrl, jsonError, readJson } from '@/lib/http';
import { notifyMentions } from '@/lib/notifications';
import { toPublicPost } from '@/lib/post-response';
import { parseFiles, type CodeFile } from '@/lib/code-files';
import { DEVBIT_LENGTH, VIDEO_LENGTH, videoAssetProblem } from '@/lib/media-rules';
import { isPostKind, withoutDevBits } from '@/lib/post-kinds';
import { deleteVideoAsset, findVideoUpload, publicPlaybackId } from '@/lib/mux';

// All regular posts, newest first. DevBits have their own feed (/api/devbits).
export async function GET(req: Request) {
  try {
    const viewer = await getAuthUser(req);
    await connectToDatabase();
    const posts = await Post.find(withoutDevBits()).sort({ createdAt: -1 }).lean();
    return NextResponse.json(posts.map((post) => toPublicPost(post, viewer)));
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
    if (caption.length > LIMITS.caption) {
      return jsonError(`Caption must be ${LIMITS.caption} characters or fewer`, 400);
    }

    const image = optionalString(body.image);
    const video = optionalString(body.video);
    // A code post sends `files`. The older form, `code` with an optional
    // `language`, still works and becomes one file without a name. Code keeps
    // its own whitespace, so it is not trimmed.
    const oldCode = typeof body.code === 'string' && body.code.trim() ? body.code : undefined;
    if (body.files !== undefined && oldCode) return jsonError('Send either files or code, not both', 400);
    let files: CodeFile[] | undefined;
    if (body.files !== undefined || oldCode) {
      const parsed = parseFiles(
        body.files !== undefined
          ? body.files
          : [{ name: '', language: optionalString(body.language) ?? 'javascript', code: oldCode }],
      );
      if ('error' in parsed) return jsonError(parsed.error, 400);
      files = parsed.files;
    }

    if (image && image.length > LIMITS.url) return jsonError('Image URL is too long', 400);
    if (video && video.length > LIMITS.url) return jsonError('Video URL is too long', 400);
    if (image && !isHttpUrl(image)) return jsonError('Image must be an http(s) URL', 400);
    if (video && !isHttpUrl(video)) return jsonError('Video must be an http(s) URL', 400);
    const videoUploadId = optionalString(body.videoUploadId);
    if (videoUploadId && video) return jsonError('Choose either an uploaded video or a video link', 400);
    const kind = body.kind ?? 'post';
    if (!isPostKind(kind)) return jsonError('Kind must be "post" or "devbit"', 400);
    if (kind === 'devbit') {
      if (!videoUploadId) return jsonError('A DevBit needs an uploaded video', 400);
      if (image || video || files) return jsonError('A DevBit is a video and a caption only', 400);
    }

    await connectToDatabase();

    const author = await User.findOne({ username: auth.username }).select('username avatar').lean();
    if (!author) return jsonError('Authentication required', 401);

    let muxVideo;
    if (videoUploadId) {
      const upload = await findVideoUpload(videoUploadId, auth.id);
      if (!upload) return jsonError('Video upload not found', 404);
      if (!upload.asset) {
        return upload.status === 'failed'
          ? jsonError('This video could not be processed', 400)
          : jsonError('This video is still uploading', 409);
      }
      const length = kind === 'devbit' ? DEVBIT_LENGTH : VIDEO_LENGTH;
      const problem = videoAssetProblem(upload.asset, auth.id, length);
      if (problem) {
        // A video over the limit can never be posted, so it is not kept.
        if (problem.message === length.message) await deleteVideoAsset(upload.asset.id);
        return jsonError(problem.message, problem.status);
      }
      if (await Post.exists({ 'muxVideo.assetId': upload.asset.id })) {
        return jsonError('This video is already posted', 409);
      }
      muxVideo = {
        assetId: upload.asset.id,
        playbackId: publicPlaybackId(upload.asset) as string,
        aspectRatio: upload.asset.aspect_ratio,
        duration: upload.asset.duration,
      };
    }

    const post = await Post.create({
      author: {
        username: auth.username,
        avatar: (author as { avatar?: string }).avatar || '/placeholder.svg',
      },
      caption,
      kind,
      image,
      video,
      muxVideo,
      files,
      language: files?.[0].language,
    });

    await notifyMentions(auth.username, caption, 'mentioned you in a post', String(post._id));

    return NextResponse.json(toPublicPost(post, auth), { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Create post error', 'Failed to create post');
  }
}
