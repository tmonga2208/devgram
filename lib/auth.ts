import { NextResponse } from "next/server"
import { readCookie, verifyToken, type AuthUser } from "@/lib/tokens"

export { signToken, type AuthUser } from "@/lib/tokens"

// Returns null for a missing, malformed or expired token.
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const header = req.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) return null
  const token = header.slice(7).trim()
  return token ? verifyToken(token) : null
}

// The signed-in user from the `token` cookie the browser keeps for
// middleware.ts: for links the browser follows, which carry no header.
export async function getCookieUser(req: Request): Promise<AuthUser | null> {
  const token = readCookie(req, "token")
  return token ? verifyToken(token) : null
}

export async function requireAuth(req: Request): Promise<AuthUser | NextResponse> {
  const user = await getAuthUser(req)
  return user ?? NextResponse.json({ error: "Authentication required" }, { status: 401 })
}
