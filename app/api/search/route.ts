import { NextResponse } from "next/server"
import { connectDB } from "@/lib/db"
import { authMiddleware } from "@/lib/auth"
import type { AuthRequest } from "@/lib/auth"
import User from "@/models/User"
import Post from "@/models/Post"

export async function GET(req: AuthRequest) {
  try {
    // Check authentication
    const authResponse = await authMiddleware(req);
    if (authResponse instanceof NextResponse) {
      return authResponse;
    }
    
    await connectDB();
    
    // Get search query from URL
    const url = new URL(req.url);
    const query = url.searchParams.get('q');
    const type = url.searchParams.get('type') || 'all'; // 'all', 'users', or 'posts'
    
    if (!query) {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }
    
    // Create search regex
    const searchRegex = new RegExp(query, 'i');
    
    const results: {
      users: Array<{
        _id: string;
        username: string;
        fullName: string;
        avatar: string;
        bio: string;
      }>;
      posts: Array<{
        _id: string;
        content: string;
        image?: string;
        author: {
          _id: string;
          username: string;
          avatar: string;
        };
        createdAt: string;
      }>;
    } = {
      users: [],
      posts: []
    };
    
    // Search for users if type is 'all' or 'users'
    if (type === 'all' || type === 'users') {
      const users = await User.find({
        $or: [
          { username: searchRegex },
          { fullName: searchRegex }
        ]
      })
      .select('username fullName avatar bio')
      .limit(10)
      .lean();
      
      results.users = users;
    }
    
    // Search for posts if type is 'all' or 'posts'
    if (type === 'all' || type === 'posts') {
      const posts = await Post.find({
        $or: [
          { content: searchRegex },
          { 'comments.content': searchRegex }
        ]
      })
      .populate('author', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
      
      results.posts = posts;
    }
    
    return NextResponse.json(results);
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Failed to perform search' },
      { status: 500 }
    );
  }
} 