import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { IUser } from '@/models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

type AuthUser = Pick<IUser, 'id' | 'username' | 'email' | 'avatar'>;

export interface AuthRequest extends NextRequest {
  user?: AuthUser;
}

export function generateToken(user: IUser): string {
  return jwt.sign(
    { 
      id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

export async function authMiddleware(req: AuthRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const decoded = verifyToken(token);
    
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Add user info to request
    req.user = decoded;
    
    return req;
  } catch (error) {
    console.error('Authentication error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 }
    );
  }
} 