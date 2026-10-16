import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { resolveLink } from "@/lib/github"
import { NOT_A_LINK, parseGitHubLink } from "@/lib/github-links"
import { handleRouteError, jsonError } from "@/lib/http"

// A pasted link, or a repository from the list, as a fixed place on GitHub.
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const link = parseGitHubLink(new URL(req.url).searchParams.get("url") ?? "")
    if (!link) return jsonError(NOT_A_LINK, 400)
    return NextResponse.json(await resolveLink(link))
  } catch (error) {
    return handleRouteError(error, "GitHub link error", "Failed to open the link")
  }
}
