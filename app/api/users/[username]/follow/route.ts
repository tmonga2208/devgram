import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/db"
import { authMiddleware } from "@/lib/auth"
import type { AuthRequest } from "@/lib/auth"
import User from "@/models/User"
import { Types } from "mongoose"
import Notification from "@/models/Notification"

// Helper function to check if a user is following another user
async function isUserFollowing(followerUsername: string, followedUsername: string) {
  const follower = await User.findOne({ username: followerUsername });
  const followed = await User.findOne({ username: followedUsername });
  
  if (!follower || !followed) return false;
  
  // Ensure following is an array
  const followingIds = Array.isArray(follower.following) ? follower.following : [];
  return followingIds.some((id: Types.ObjectId) => id.toString() === followed._id.toString());
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

export async function POST(
  request: NextRequest,
  context: { params: { username: string } }
) {
  try {
    // Convert NextRequest to AuthRequest
    const req = request as unknown as AuthRequest;
    
    // Check authentication
    const authResponse = await authMiddleware(req);
    if (authResponse instanceof NextResponse) {
      return authResponse;
    }

    await connectDB();
    
    // Get the username from context params
    const targetUsername = context.params.username;
    const currentUsername = req.user?.username;
    
    if (!currentUsername) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Get the user to follow
    const userToFollow = await User.findOne({ username: targetUsername });
    if (!userToFollow) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get the current user
    const currentUser = await User.findOne({ username: currentUsername });
    if (!currentUser) {
      return NextResponse.json(
        { error: "Current user not found" },
        { status: 404 }
      );
    }

    // Check if already following
    const isFollowing = await isUserFollowing(currentUsername, targetUsername);
    
    if (isFollowing) {
      // Unfollow - remove the user from following array
      const followingArray = Array.isArray(currentUser.following) ? currentUser.following : [];
      const updatedFollowing = followingArray.filter(
        (id: Types.ObjectId) => id.toString() !== userToFollow._id.toString()
      );
      
      // Update the user documents
      await User.updateOne(
        { username: currentUsername },
        { 
          following: updatedFollowing,
          followingCount: Math.max(0, (currentUser.followingCount || 0) - 1)
        }
      );
      
      await User.updateOne(
        { username: targetUsername },
        { followers: Math.max(0, (userToFollow.followers || 0) - 1) }
      );
    } else {
      // Follow - add the user to following array
      const followingArray = Array.isArray(currentUser.following) ? currentUser.following : [];
      const updatedFollowing = [...followingArray, userToFollow._id];
      
      // Update the user documents
      await User.updateOne(
        { username: currentUsername },
        { 
          following: updatedFollowing,
          followingCount: (currentUser.followingCount || 0) + 1
        }
      );
      
      await User.updateOne(
        { username: targetUsername },
        { followers: (userToFollow.followers || 0) + 1 }
      );
      
      // Create a notification for the followed user
      await createNotification(
        currentUsername,
        targetUsername,
        'follow',
        'started following you'
      );
    }

    // Get updated user data
    const updatedUserToFollow = await User.findOne({ username: targetUsername });
    const updatedCurrentUser = await User.findOne({ username: currentUsername });

    return NextResponse.json({
      following: !isFollowing,
      followers: updatedUserToFollow?.followers || 0,
      followingCount: updatedCurrentUser?.followingCount || 0,
    });
  } catch (error) {
    console.error("Follow/unfollow error:", error);
    return NextResponse.json(
      { error: "Failed to follow/unfollow user" },
      { status: 500 }
    );
  }
} 