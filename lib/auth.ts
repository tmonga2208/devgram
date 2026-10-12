import { NextResponse } from "next/server"
import { SignJWT, jwtVerify } from "jose"

export interface AuthUser {
  id: string
  username: string
  email: string
}

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("Please define the JWT_SECRET environment variable inside .env.local")
  }
  return new TextEncoder().encode(secret)
}

export async function signToken(user: AuthUser) {
  return new SignJWT({ id: user.id, username: user.username, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret())
}

// Returns null for a missing, malformed or expired token.
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const header = req.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) return null
  const token = header.slice(7).trim()
  if (!token) return null

  const secret = getSecret()
  try {
    const { payload } = await jwtVerify(token, secret)
    if (
      typeof payload.id !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.email !== "string"
    ) {
      return null
    }
    return { id: payload.id, username: payload.username, email: payload.email }
  } catch {
    return null
  }
}

export async function requireAuth(req: Request): Promise<AuthUser | NextResponse> {
  const user = await getAuthUser(req)
  return user ?? NextResponse.json({ error: "Authentication required" }, { status: 401 })
}
