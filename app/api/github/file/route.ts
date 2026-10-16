import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { BAD_SOURCE, parseGitHubSource } from "@/lib/code-files"
import { fetchGitHubFile } from "@/lib/github"
import { handleRouteError, jsonError } from "@/lib/http"

// One file's text at a commit, checked, with its suggested name and language.
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const params = new URL(req.url).searchParams
    const source = parseGitHubSource({
      owner: params.get("owner"),
      repo: params.get("repo"),
      commit: params.get("commit"),
      path: params.get("path"),
    })
    if (!source) return jsonError(BAD_SOURCE, 400)
    return NextResponse.json(await fetchGitHubFile(source))
  } catch (error) {
    return handleRouteError(error, "GitHub file error", "Failed to fetch the file")
  }
}
