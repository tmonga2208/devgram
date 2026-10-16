import { NextResponse } from "next/server"
import { getCookieUser } from "@/lib/auth"
import { deleteGrant, exchangeCode, readGitHubUser } from "@/lib/github"
import { CONNECT_COOKIE, connectCookieOptions, readConnect, returnUrl } from "@/lib/github-connect"
import { connectToDatabase } from "@/lib/mongodb"
import { readCookie } from "@/lib/tokens"
import User from "@/models/User"

// Where GitHub sends people back after its sign-in page. Saves the GitHub
// account on the Devgram account that started connecting, then returns to
// where they began with ?github=connected, taken, cancelled or error.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const attempt = await readConnect(readCookie(req, CONNECT_COOKIE))
  const finish = (result: string, login?: string) => {
    const response = NextResponse.redirect(returnUrl(url.origin, attempt?.returnTo ?? "", result, login))
    response.cookies.set(CONNECT_COOKIE, "", connectCookieOptions(url.protocol === "https:", 0))
    return response
  }
  if (!attempt) return finish("error")
  if (url.searchParams.get("error") === "access_denied") return finish("cancelled")
  const code = url.searchParams.get("code")
  // The state proves this return belongs to the attempt this browser started.
  if (!code || url.searchParams.get("state") !== attempt.state) return finish("error")
  const user = await getCookieUser(req)
  if (!user || user.id !== attempt.userId) return finish("error")
  try {
    const token = await exchangeCode({ code, verifier: attempt.verifier, redirectUri: `${url.origin}/api/github/callback` })
    let account: { id: number; login: string }
    try {
      account = await readGitHubUser(token)
    } finally {
      // Devgram never needs GitHub's permission again, so nothing is left behind.
      await deleteGrant(token)
    }
    await connectToDatabase()
    const saved = await User.findByIdAndUpdate(user.id, { github: account }, { new: true })
    return saved ? finish("connected", account.login) : finish("error")
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return finish("taken")
    console.error("GitHub connect error:", error)
    return finish("error")
  }
}
