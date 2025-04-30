import { NextResponse } from "next/server"
import { jwtVerify } from "jose"

export interface AuthRequest extends Request {
  user?: {
    username: string
    avatar?: string
  }
}

export async function authMiddleware(req: AuthRequest) {
  try {
    const token = req.headers.get("authorization")?.split(" ")[1]

    if (!token) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)

    req.user = {
      username: payload.username as string,
      avatar: payload.avatar as string,
    }

    return null
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid token" },
      { status: 401 }
    )
  }
} 