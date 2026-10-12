import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import { getAuthUser } from '@/lib/auth';
import { handleRouteError, jsonError } from '@/lib/http';

// Public profile. isFollowing reflects the caller when a valid token is sent.
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await params;

    await connectToDatabase();

    const user = await User.findOne({ username })
      .select('username fullName avatar bio website followers following isVerified')
      .lean();
    if (!user) return jsonError('User not found', 404);

    const profile = user as {
      _id: unknown;
      username: string;
      fullName: string;
      avatar?: string;
      bio?: string;
      website?: string;
      followers?: number;
      following?: unknown[];
      isVerified?: boolean;
    };

    const viewer = await getAuthUser(req);
    const isFollowing = viewer
      ? Boolean(await User.exists({ username: viewer.username, following: profile._id }))
      : false;

    return NextResponse.json({
      _id: profile._id,
      username: profile.username,
      fullName: profile.fullName,
      avatar: profile.avatar || '/placeholder.svg',
      bio: profile.bio || '',
      website: profile.website || '',
      followers: profile.followers || 0,
      following: profile.following ? profile.following.length : 0,
      isVerified: Boolean(profile.isVerified),
      isFollowing,
    });
  } catch (error) {
    return handleRouteError(error, 'Fetch user error', 'Failed to fetch user');
  }
}
