import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { BAD_SOURCE, COMMIT_PATTERN, OWNER_PATTERN, isRepoName } from "@/lib/code-files"
import { listTree } from "@/lib/github"
import { handleRouteError, jsonError } from "@/lib/http"

// Every folder and file of a repository at a commit.
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const params = new URL(req.url).searchParams
    const owner = params.get("owner") ?? ""
    const repo = params.get("repo") ?? ""
    const commit = params.get("commit") ?? ""
    if (!OWNER_PATTERN.test(owner) || !isRepoName(repo) || !COMMIT_PATTERN.test(commit)) return jsonError(BAD_SOURCE, 400)
    return NextResponse.json({ entries: await listTree(owner, repo, commit) })
  } catch (error) {
    return handleRouteError(error, "GitHub tree error", "Failed to list the repository")
  }
}
