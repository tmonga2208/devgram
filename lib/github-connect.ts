// The 10-minute cookie that carries a connect attempt from Devgram to GitHub
// and back: a random state (so nobody can attach their GitHub account to
// yours with a crafted link), the PKCE verifier, who started it and where to
// return. Signed, so it can't be altered.
import { createHash, randomBytes } from "node:crypto"
import { safeReturnPath } from "@/lib/github-links"
import { signPayload, verifyPayload } from "@/lib/tokens"

export const CONNECT_COOKIE = "github_connect"
// How long connecting may take, GitHub's sign-in page included.
export const CONNECT_SECONDS = 600
// Tells this record apart from a login token, which the same secret signs.
const PURPOSE = "github-connect"

export interface ConnectAttempt {
  state: string
  verifier: string
  userId: string
  returnTo: string
}

const random = () => randomBytes(32).toString("base64url")

// PKCE's S256 challenge: the verifier's SHA-256, in base64url.
export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url")
}

export async function startConnect(userId: string, returnTo: string | null): Promise<{ cookie: string; attempt: ConnectAttempt }> {
  const attempt: ConnectAttempt = { state: random(), verifier: random(), userId, returnTo: safeReturnPath(returnTo) }
  return { cookie: await signPayload({ ...attempt, purpose: PURPOSE }, CONNECT_SECONDS), attempt }
}

// The attempt a cookie carries, or null when it's missing, altered, expired
// or not a connect cookie.
export async function readConnect(cookie: string | null): Promise<ConnectAttempt | null> {
  const payload = cookie ? await verifyPayload(cookie) : null
  if (!payload || payload.purpose !== PURPOSE) return null
  const { state, verifier, userId, returnTo } = payload
  if (typeof state !== "string" || typeof verifier !== "string" || typeof userId !== "string" || typeof returnTo !== "string") {
    return null
  }
  return { state, verifier, userId, returnTo: safeReturnPath(returnTo) }
}

// The page to send someone back to, saying how connecting went.
export function returnUrl(origin: string, returnTo: string, result: string, login?: string): URL {
  const url = new URL(safeReturnPath(returnTo), origin)
  url.searchParams.set("github", result)
  if (login) url.searchParams.set("github_login", login)
  return url
}

// Only the GitHub routes see the cookie, scripts never do, and the live site
// sends it over HTTPS only.
export function connectCookieOptions(secure: boolean, maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/api/github", maxAge }
}
