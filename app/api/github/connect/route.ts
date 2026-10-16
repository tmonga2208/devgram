import { NextResponse } from "next/server"
import { getCookieUser, requireAuth } from "@/lib/auth"
import { authorizeUrl, isGitHubSetUp } from "@/lib/github"
import { CONNECT_COOKIE, CONNECT_SECONDS, challengeFor, connectCookieOptions, returnUrl, startConnect } from "@/lib/github-connect"
import { safeReturnPath } from "@/lib/github-links"
import { handleRouteError, jsonError } from "@/lib/http"
import { connectToDatabase } from "@/lib/mongodb"
import { toPrivateUser } from "@/lib/user-response"
import User from "@/models/User"

// Starts connecting GitHub. It's a plain link, so the sign-in cookie (the one
// middleware.ts reads) says who is connecting.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const returnTo = safeReturnPath(url.searchParams.get("return"))
  try {
    if (!isGitHubSetUp()) return NextResponse.redirect(returnUrl(url.origin, returnTo, "unavailable"))
    const user = await getCookieUser(req)
    if (!user) {
      const login = new URL("/login", url.origin)
      login.searchParams.set("from", returnTo)
      return NextResponse.redirect(login)
    }
    const { cookie, attempt } = await startConnect(user.id, returnTo)
    const response = NextResponse.redirect(
      authorizeUrl({ state: attempt.state, challenge: challengeFor(attempt.verifier), redirectUri: `${url.origin}/api/github/callback` }),
    )
    response.cookies.set(CONNECT_COOKIE, cookie, connectCookieOptions(url.protocol === "https:", CONNECT_SECONDS))
    return response
  } catch (error) {
    console.error("GitHub connect start error:", error)
    return NextResponse.redirect(returnUrl(url.origin, returnTo, "error"))
  }
}

// Disconnects GitHub: the account is forgotten; posts made from GitHub stay.
export async function DELETE(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    await connectToDatabase()
    const user = await User.findOneAndUpdate({ username: auth.username }, { $unset: { github: 1 } }, { new: true })
    if (!user) return jsonError("Authentication required", 401)
    return NextResponse.json(toPrivateUser(user))
  } catch (error) {
    return handleRouteError(error, "GitHub disconnect error", "Failed to disconnect GitHub")
  }
}
