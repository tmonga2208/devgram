// Reading GitHub links and building them, for the picker, the code view and
// the server, with the messages and answers they share. It imports only the
// file rules, so the unit tests load it directly.
import {
  COMMIT_PATTERN,
  MAX_FILE_NAME,
  OWNER_PATTERN,
  isRepoName,
  type GitHubSource,
  type MarkedLines,
} from "@/lib/code-files"

export const NOT_A_LINK = "That isn't a GitHub link"
export const REPO_NOT_FOUND = "That repository doesn't exist or is private"
export const FILE_NOT_FOUND = "That file isn't in this repository"
export const FOLDER_NOT_FOUND = "That folder isn't in this repository"
export const TOO_BIG_TO_BROWSE = "This repository is too big to browse here — paste a link to the file instead"
export const NOT_TEXT = "This file isn't text, so it can't be shared"
export const BUSY = "GitHub is busy — try again in a few minutes"
export const UNREACHABLE = "Couldn't reach GitHub — try again"
export const CONNECT_FIRST = "Connect GitHub first"
export const ACCOUNT_GONE = "Couldn't find your GitHub account — connect GitHub again"
export const TAKEN = "This GitHub account is connected to another Devgram account"
export const CONNECT_FAILED = "Couldn't connect GitHub — try again"
export const NOT_SET_UP = "GitHub isn't set up on this server"

// What the GitHub routes answer with (app/api/github).
export interface GitHubRepo {
  owner: string
  name: string
  description: string
  language: string | null
  defaultBranch: string
}

export interface ResolvedLink {
  owner: string
  repo: string
  commit: string
  kind: "repo" | "folder" | "file"
  // The folder or file; "" for the repository itself.
  path: string
  marked: MarkedLines | null
}

export interface TreeEntry {
  path: string
  type: "file" | "folder"
  // Files only: the size in bytes.
  size?: number
}

export interface GitHubFileResponse {
  name: string
  language: string
  code: string
  lineCount: number
  github: GitHubSource
}

// A pasted link, read without asking GitHub anything.
export interface GitHubLink {
  owner: string
  repo: string
  // The repository's front page, a folder (tree/) or a file (blob/).
  kind: "repo" | "tree" | "blob"
  // What follows tree/ or blob/: a branch, tag or commit, then the path. Only
  // GitHub can tell where a branch name ends, so the two stay together.
  rest: string
  marked: MarkedLines | null
}

const HOSTS = new Set(["github.com", "www.github.com"])
const MAX_LINK = 2048

// Lines from a link's anchor: #L5, #L5-L9, and the column form #L5C3-L9C10.
function readAnchor(hash: string): MarkedLines | null {
  const match = /^#L(\d+)(?:C\d+)?(?:-L(\d+)(?:C\d+)?)?$/.exec(hash)
  if (!match) return null
  const a = Number(match[1])
  const b = match[2] ? Number(match[2]) : a
  if (a < 1 || b < 1) return null
  return { from: Math.min(a, b), to: Math.max(a, b) }
}

// A link to a repository, a folder or a file on github.com, or null. Links to
// a repository's other pages (issues, pull requests…) count as the repository.
export function parseGitHubLink(input: string): GitHubLink | null {
  const text = input.trim()
  if (!text || text.length > MAX_LINK) return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || !HOSTS.has(url.hostname.toLowerCase())) return null
  let segments: string[]
  try {
    segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment))
  } catch {
    return null
  }
  if (segments.length < 2) return null
  const owner = segments[0]
  const repo = segments[1].replace(/\.git$/i, "")
  if (!OWNER_PATTERN.test(owner) || !isRepoName(repo)) return null
  const mode = segments[2]
  if ((mode === "tree" || mode === "blob") && segments.length > 3) {
    return { owner, repo, kind: mode, rest: segments.slice(3).join("/"), marked: mode === "blob" ? readAnchor(url.hash) : null }
  }
  return { owner, repo, kind: "repo", rest: "", marked: null }
}

// The ways to split a link's rest into a branch (or tag, or commit) and a
// path, shortest branch first, at most `max`. A file link needs a path; a
// folder link may name just a branch. A link that starts with a full commit
// has only one reading.
export function refCandidates(rest: string, needPath: boolean, max = 5): { ref: string; path: string }[] {
  const segments = rest.split("/").filter(Boolean)
  if (segments.length === 0) return []
  if (COMMIT_PATTERN.test(segments[0])) {
    const path = segments.slice(1).join("/")
    return needPath && !path ? [] : [{ ref: segments[0], path }]
  }
  const candidates: { ref: string; path: string }[] = []
  for (let cut = 1; cut <= segments.length && candidates.length < max; cut++) {
    const path = segments.slice(cut).join("/")
    if (needPath && !path) break
    candidates.push({ ref: segments.slice(0, cut).join("/"), path })
  }
  return candidates
}

const RENDERED = /\.(md|markdown|mdx)$/i

// The file on github.com at its commit, opened at the marked lines. Markdown
// gets ?plain=1, so GitHub shows lines instead of the rendered page.
export function githubFileUrl(source: GitHubSource, marked?: MarkedLines | null): string {
  const path = source.path.split("/").map(encodeURIComponent).join("/")
  const plain = RENDERED.test(source.path) ? "?plain=1" : ""
  const lines = marked ? (marked.from === marked.to ? `#L${marked.from}` : `#L${marked.from}-L${marked.to}`) : ""
  return `https://github.com/${source.owner}/${source.repo}/blob/${source.commit}/${path}${plain}${lines}`
}

// A GitHub file's tab name: the last part of its path, cut to the longest
// name a file may have, with any backslash (names can't hold one) made "_".
export function githubFileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\\/g, "_").slice(0, MAX_FILE_NAME)
}

// The folder a path is in; "" for the top of the repository.
export function parentFolder(path: string): string {
  const slash = path.lastIndexOf("/")
  return slash === -1 ? "" : path.slice(0, slash)
}

// What a folder holds directly: folders first, then files, each A to Z.
export function entriesInFolder(entries: TreeEntry[], folder: string): TreeEntry[] {
  return entries
    .filter((entry) => parentFolder(entry.path) === folder)
    .sort((a, b) => (a.type === b.type ? a.path.localeCompare(b.path) : a.type === "folder" ? -1 : 1))
}

// Files whose path holds what was typed, anywhere, ignoring case: the first `limit`.
export function matchFiles(entries: TreeEntry[], query: string, limit = 50): TreeEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  return entries.filter((entry) => entry.type === "file" && entry.path.toLowerCase().includes(needle)).slice(0, limit)
}

const FALLBACK_RETURN = "/settings?tab=account"

// Where to send someone after GitHub: a page on this site, or Settings.
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || value.length > 200 || !value.startsWith("/") || /[\u0000-\u001f\\]/.test(value)) return FALLBACK_RETURN
  const base = "https://devgram.invalid"
  const resolved = new URL(value, base)
  return resolved.origin === base ? `${resolved.pathname}${resolved.search}` : FALLBACK_RETURN
}

// The link that starts connecting GitHub, coming back to `returnTo`.
export function connectHref(returnTo: string): string {
  return `/api/github/connect?return=${encodeURIComponent(returnTo)}`
}

// What a page says when GitHub sends someone back with ?github=<result>.
export function githubReturnMessage(
  result: string | null,
  login: string | null,
): { kind: "success" | "error"; text: string } | null {
  if (result === "connected") return { kind: "success", text: login ? `Connected GitHub as @${login}` : "Connected GitHub" }
  if (result === "taken") return { kind: "error", text: TAKEN }
  if (result === "error") return { kind: "error", text: CONNECT_FAILED }
  if (result === "unavailable") return { kind: "error", text: NOT_SET_UP }
  return null
}
