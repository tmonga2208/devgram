import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User, { IUser } from '@/models/User';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import mongoose from 'mongoose';

export async function GET(
  req: NextRequest,
  { params }: { params: { username: string } }
) {
  try {
    await connectDB();
    
    // Get the current user's token if available
    const token = req.headers.get('authorization')?.split(' ')[1];
    let currentUser: IUser | null = null;
    
    if (token) {
      try {
        const authResponse = await authMiddleware(req as AuthRequest);
        if (!(authResponse instanceof NextResponse)) {
          currentUser = await User.findOne({ username: (req as AuthRequest).user?.username });
        }
      } catch (error) {
        console.error('Auth error:', error);
      }
    }
    
    const user = await User.findOne({ username: params.username })
      .select('-password -email')
      .lean();
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    // Add isFollowing field and calculate following count
    const response = {
      ...user,
      isFollowing: currentUser ? currentUser.following.some((id: mongoose.Types.ObjectId) => id.toString() === user._id.toString()) : false,
      following: user.following ? user.following.length : 0
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Fetch user error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: AuthRequest,
  { params }: { params: { username: string } }
) {
  try {
    // Check authentication
    const authResponse = await authMiddleware(req);
    if (authResponse instanceof NextResponse) {
      return authResponse;
    }

    // Check if user is updating their own profile
    if (req.user?.username !== params.username) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }
    
    await connectDB();
    
    const { fullName, bio, website, avatar } = await req.json();
    
    const user = await User.findOne({ username: params.username });
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    // Update user fields
    if (fullName) user.fullName = fullName;
    if (bio !== undefined) user.bio = bio;
    if (website !== undefined) user.website = website;
    if (avatar) user.avatar = avatar;
    
    await user.save();
    
    // Return updated user without sensitive information
    const updatedUser = {
      id: user._id,
      username: user.username,
      fullName: user.fullName,
      avatar: user.avatar,
      bio: user.bio,
      website: user.website,
      followers: user.followers,
      following: user.following,
    };
    
    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
} 