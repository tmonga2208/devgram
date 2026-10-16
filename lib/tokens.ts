// The app's signed tokens: the login token, and small signed records such as
// the GitHub connect cookie. No Next.js imports, so the unit tests load it.
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

// The user a login token names, or null for a malformed, altered or expired one.
export async function verifyToken(token: string): Promise<AuthUser | null> {
  const secret = getSecret()
  try {
    const { payload } = await jwtVerify(token, secret)
    if (typeof payload.id !== "string" || typeof payload.username !== "string" || typeof payload.email !== "string") {
      return null
    }
    return { id: payload.id, username: payload.username, email: payload.email }
  } catch {
    return null
  }
}

// Signs a small record with the app's secret, valid for `seconds`.
export async function signPayload(payload: Record<string, string>, seconds: number) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${seconds}s`).sign(getSecret())
}

// A record signPayload made, or null when it was altered or has expired.
export async function verifyPayload(token: string): Promise<Record<string, unknown> | null> {
  const secret = getSecret()
  try {
    return (await jwtVerify(token, secret)).payload as Record<string, unknown>
  } catch {
    return null
  }
}

// A cookie's value from a request, or null.
export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=")
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return null
    }
  }
  return null
}
