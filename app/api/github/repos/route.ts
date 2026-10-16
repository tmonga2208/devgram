import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { listRepos } from "@/lib/github"
import { CONNECT_FIRST } from "@/lib/github-links"
import { handleRouteError, jsonError } from "@/lib/http"
import { connectToDatabase } from "@/lib/mongodb"
import User from "@/models/User"

// Your public repositories, most recently pushed first, for the picker.
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    await connectToDatabase()
    const user = await User.findOne({ username: auth.username }).select("github").lean()
    const login = (user as { github?: { login?: string } } | null)?.github?.login
    if (!login) return jsonError(CONNECT_FIRST, 409)
    return NextResponse.json(await listRepos(login))
  } catch (error) {
    return handleRouteError(error, "GitHub repositories error", "Failed to list your repositories")
  }
}
