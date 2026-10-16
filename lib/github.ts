// Every call Devgram makes to GitHub. Public data is read with the OAuth
// app's own client ID and secret (GitHub allows 5,000 requests an hour for
// the whole site). A person's token is used only while connecting, to learn
// who they are, and then Devgram deletes its authorization (deleteGrant).
// Server only, with no Next.js imports, so the unit tests load it.
import { Buffer } from "node:buffer"
import {
  BAD_SOURCE,
  COMMIT_PATTERN,
  EMPTY_FILE,
  GITHUB_FILE_TOO_LONG,
  MAX_FILES,
  MAX_GITHUB_FILE_CHARS,
  displayLines,
  guessLanguage,
  parseGitHubSource,
  type GitHubSource,
} from "@/lib/code-files"
import {
  ACCOUNT_GONE,
  BUSY,
  CONNECT_FAILED,
  FILE_NOT_FOUND,
  FOLDER_NOT_FOUND,
  NOT_SET_UP,
  NOT_TEXT,
  REPO_NOT_FOUND,
  TOO_BIG_TO_BROWSE,
  UNREACHABLE,
  githubFileName,
  refCandidates,
  type GitHubFileResponse,
  type GitHubLink,
  type GitHubRepo,
  type ResolvedLink,
  type TreeEntry,
} from "@/lib/github-links"
import { HttpError } from "@/lib/http-error"

// The unit tests point these at a stand-in for GitHub.
const apiBase = () => process.env.GITHUB_API_URL || "https://api.github.com"
const webBase = () => process.env.GITHUB_WEB_URL || "https://github.com"
const TIMEOUT_MS = 10_000
// A repository with more entries than this isn't browsed: its list would be
// too much to send to a phone. Links to its files still work.
export const MAX_TREE_ENTRIES = 10_000
// UTF-8 takes at most 3 bytes for each character JavaScript counts, so a file
// bigger than this can't be within MAX_GITHUB_FILE_CHARS.
const MAX_FILE_BYTES = MAX_GITHUB_FILE_CHARS * 3

export function isGitHubSetUp(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
}

function credentials() {
  const id = process.env.GITHUB_CLIENT_ID
  const secret = process.env.GITHUB_CLIENT_SECRET
  if (!id || !secret) throw new HttpError(NOT_SET_UP, 503)
  return { id, secret }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

interface CallOptions {
  method?: string
  accept?: string
  body?: unknown
  // A person's token instead of the app's ID and secret.
  token?: string
}

// One request to GitHub's API. What isn't about the thing asked for becomes
// an HttpError here: rate limits (busy), and GitHub failing or out of reach.
async function call(path: string, { method = "GET", accept = "application/vnd.github+json", body, token }: CallOptions = {}) {
  const { id, secret } = credentials()
  const headers: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "devgram",
    Authorization: token ? `Bearer ${token}` : `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
  }
  if (body !== undefined) headers["Content-Type"] = "application/json"
  let response: Response
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new HttpError(UNREACHABLE, 502)
  }
  const limited =
    response.status === 429 ||
    (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")))
  if (limited) throw new HttpError(BUSY, 503)
  if (response.status >= 500) throw new HttpError(UNREACHABLE, 502)
  return response
}

const repoPath = (owner: string, repo: string) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`

// Someone's public repositories (their own, not ones they only contribute
// to), most recently pushed first, up to 100.
export async function listRepos(login: string): Promise<GitHubRepo[]> {
  const response = await call(`/users/${encodeURIComponent(login)}/repos?type=owner&sort=pushed&per_page=100`)
  if (!response.ok) throw new HttpError(ACCOUNT_GONE, 404)
  const repos = (await response.json()) as {
    name: string
    owner: { login: string }
    description: string | null
    language: string | null
    default_branch: string
  }[]
  return repos.map((repo) => ({
    owner: repo.owner.login,
    name: repo.name,
    description: repo.description ?? "",
    language: repo.language,
    defaultBranch: repo.default_branch,
  }))
}

// The full commit a branch, tag or commit names, or null when the
// repository has nothing by that name.
async function findCommit(owner: string, repo: string, ref: string): Promise<string | null> {
  const response = await call(`${repoPath(owner, repo)}/commits/${encodeURIComponent(ref)}`, { accept: "application/vnd.github.sha" })
  if (response.status === 404 || response.status === 422) return null
  if (!response.ok) throw new HttpError(REPO_NOT_FOUND, 404)
  const sha = (await response.text()).trim()
  return COMMIT_PATTERN.test(sha) ? sha : null
}

// A pasted link as a fixed place on GitHub: the repository as GitHub spells
// it, a full commit, and the folder or file.
export async function resolveLink(link: GitHubLink): Promise<ResolvedLink> {
  const response = await call(repoPath(link.owner, link.repo))
  if (!response.ok) throw new HttpError(REPO_NOT_FOUND, 404)
  const info = (await response.json()) as { name: string; owner: { login: string }; default_branch: string }
  const owner = info.owner.login
  const repo = info.name
  if (link.kind === "repo") {
    const commit = await findCommit(owner, repo, info.default_branch)
    // An empty repository has no commit to show.
    if (!commit) throw new HttpError(REPO_NOT_FOUND, 404)
    return { owner, repo, commit, kind: "repo", path: "", marked: null }
  }
  const file = link.kind === "blob"
  for (const { ref, path } of refCandidates(link.rest, file)) {
    const commit = await findCommit(owner, repo, ref)
    if (commit) return { owner, repo, commit, kind: file ? "file" : "folder", path, marked: file ? link.marked : null }
  }
  throw new HttpError(file ? FILE_NOT_FOUND : FOLDER_NOT_FOUND, 404)
}

// Every folder and file at a commit, in one call. Submodules (other
// repositories) and symlinks (a path, not code) are left out.
export async function listTree(owner: string, repo: string, commit: string): Promise<TreeEntry[]> {
  const response = await call(`${repoPath(owner, repo)}/git/trees/${commit}?recursive=1`)
  if (!response.ok) throw new HttpError(REPO_NOT_FOUND, 404)
  const data = (await response.json()) as {
    truncated?: boolean
    tree?: { path: string; mode: string; type: string; size?: number }[]
  }
  const tree = data.tree ?? []
  if (data.truncated || tree.length > MAX_TREE_ENTRIES) throw new HttpError(TOO_BIG_TO_BROWSE, 400)
  const entries: TreeEntry[] = []
  for (const item of tree) {
    if (item.type === "tree") entries.push({ path: item.path, type: "folder" })
    else if (item.type === "blob" && item.mode !== "120000") entries.push({ path: item.path, type: "file", size: item.size ?? 0 })
  }
  return entries
}

// A file's text at its commit, after the checks: it's a file (not a folder or
// a link), at most 100,000 characters (one too big for that by its size isn't
// decoded), text (valid UTF-8 without null characters), and not empty.
export async function fetchGitHubFile(source: GitHubSource): Promise<GitHubFileResponse> {
  const path = source.path.split("/").map(encodeURIComponent).join("/")
  const response = await call(`${repoPath(source.owner, source.repo)}/contents/${path}?ref=${source.commit}`)
  if (response.status === 404) throw new HttpError(FILE_NOT_FOUND, 404)
  if (!response.ok) throw new HttpError(REPO_NOT_FOUND, 404)
  const data: unknown = await response.json()
  if (!isRecord(data) || data.type !== "file") throw new HttpError(FILE_NOT_FOUND, 404)
  if (typeof data.size !== "number" || data.size > MAX_FILE_BYTES || data.encoding !== "base64" || typeof data.content !== "string") {
    throw new HttpError(GITHUB_FILE_TOO_LONG, 400)
  }
  let code: string
  try {
    code = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(data.content, "base64"))
  } catch {
    throw new HttpError(NOT_TEXT, 400)
  }
  if (code.includes("\u0000")) throw new HttpError(NOT_TEXT, 400)
  if (code.length > MAX_GITHUB_FILE_CHARS) throw new HttpError(GITHUB_FILE_TOO_LONG, 400)
  if (!code.trim()) throw new HttpError(EMPTY_FILE, 400)
  const name = githubFileName(source.path)
  return { name, language: guessLanguage(name) ?? "text", code, lineCount: displayLines(code).length, github: source }
}

// A post request's files with each GitHub file's code fetched from GitHub at
// its commit; code sent with it is replaced. Files written here, and lists
// the file rules will refuse anyway, pass through untouched.
export async function fillGitHubFiles(value: unknown): Promise<unknown> {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FILES) return value
  const filled: unknown[] = []
  for (const item of value) {
    if (!isRecord(item) || item.github == null) {
      filled.push(item)
      continue
    }
    const source = parseGitHubSource(item.github)
    if (!source) throw new HttpError(BAD_SOURCE, 400)
    const file = await fetchGitHubFile(source)
    filled.push({ ...item, github: source, code: file.code })
  }
  return filled
}

// GitHub's sign-in page for connecting. No scopes: GitHub asks only to let
// Devgram see the person's public profile.
export function authorizeUrl({ state, challenge, redirectUri }: { state: string; challenge: string; redirectUri: string }): string {
  const { id } = credentials()
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    allow_signup: "true",
  })
  return `${webBase()}/login/oauth/authorize?${params}`
}

// Trades the code GitHub sent back for the person's token.
export async function exchangeCode({ code, verifier, redirectUri }: { code: string; verifier: string; redirectUri: string }): Promise<string> {
  const { id, secret } = credentials()
  let response: Response
  try {
    response = await fetch(`${webBase()}/login/oauth/access_token`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "devgram" },
      body: JSON.stringify({ client_id: id, client_secret: secret, code, redirect_uri: redirectUri, code_verifier: verifier }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new HttpError(UNREACHABLE, 502)
  }
  const data = (await response.json().catch(() => null)) as { access_token?: unknown } | null
  const token = data?.access_token
  // GitHub answers a code it doesn't know with 200 and an `error` field.
  if (!response.ok || typeof token !== "string") throw new HttpError(CONNECT_FAILED, 400)
  return token
}

// Who a token belongs to: GitHub's account number and the username.
export async function readGitHubUser(token: string): Promise<{ id: number; login: string }> {
  const response = await call("/user", { token })
  const data = (await response.json().catch(() => null)) as { id?: unknown; login?: unknown } | null
  const id = data?.id
  const login = data?.login
  if (!response.ok || typeof id !== "number" || typeof login !== "string") throw new HttpError(CONNECT_FAILED, 400)
  return { id, login }
}

// Removes Devgram's authorization from the person's GitHub account, which
// revokes the token too. Never throws: the token is never stored either way.
export async function deleteGrant(token: string): Promise<void> {
  try {
    const { id } = credentials()
    const response = await call(`/applications/${encodeURIComponent(id)}/grant`, { method: "DELETE", body: { access_token: token } })
    if (response.status !== 204) console.error("Could not delete the GitHub authorization:", response.status)
  } catch (error) {
    console.error("Could not delete the GitHub authorization:", error instanceof Error ? error.message : error)
  }
}
