import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import { signToken } from '@/lib/auth';
import { LIMITS, handleRouteError, jsonError, readJson } from '@/lib/http';
import { toPrivateUser } from '@/lib/user-response';

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    if (!body) return jsonError('Invalid request body', 400);

    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';

    if (!username || !email || !password || !fullName) {
      return jsonError('Username, email, password and full name are required', 400);
    }
    if (email.length > LIMITS.email) {
      return jsonError(`Email must be ${LIMITS.email} characters or fewer`, 400);
    }
    if (fullName.length > LIMITS.fullName) {
      return jsonError(`Full name must be ${LIMITS.fullName} characters or fewer`, 400);
    }
    if (password.length > LIMITS.password) {
      return jsonError(`Password must be ${LIMITS.password} characters or fewer`, 400);
    }
    if (!/^\w{3,30}$/.test(username)) {
      return jsonError('Username must be 3-30 letters, numbers or underscores', 400);
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return jsonError('Please enter a valid email address', 400);
    }
    if (password.length < 6) {
      return jsonError('Password must be at least 6 characters long', 400);
    }

    await connectToDatabase();

    const existing = await User.findOne({ $or: [{ email }, { username }] }).select('username email').lean();
    if (existing) {
      const taken = (existing as { username: string }).username === username ? 'Username' : 'Email';
      return jsonError(`${taken} is already taken`, 409);
    }

    const user = await User.create({ username, email, password, fullName });
    const token = await signToken({ id: String(user._id), username: user.username, email: user.email });

    return NextResponse.json({ token, user: toPrivateUser(user) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Registration error', 'Registration failed');
  }
}
