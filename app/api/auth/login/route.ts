import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import { signToken } from '@/lib/auth';
import { handleRouteError, jsonError, readJson } from '@/lib/http';
import { toPrivateUser } from '@/lib/user-response';

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    if (!body) return jsonError('Invalid request body', 400);

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) {
      return jsonError('Email and password are required', 400);
    }

    await connectToDatabase();

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return jsonError('Invalid credentials', 401);
    }

    const token = await signToken({ id: String(user._id), username: user.username, email: user.email });
    return NextResponse.json({ token, user: toPrivateUser(user) });
  } catch (error) {
    return handleRouteError(error, 'Login error', 'Login failed');
  }
}
