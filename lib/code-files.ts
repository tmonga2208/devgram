// Rules for the files in a code post, shared by the API and the browser. It
// imports nothing, so the unit tests load it in Node.

// Where a file taken from GitHub came from: the repository as GitHub spells
// it, a full commit, and the file's path there. Only the server sets it, from
// what GitHub sent (lib/github.ts).
export interface GitHubSource {
  owner: string
  repo: string
  commit: string
  path: string
}

// The lines a file points out, counted from 1, both included.
export interface MarkedLines {
  from: number
  to: number
}

export interface CodeFile {
  name: string
  language: string
  code: string
  // Files from GitHub only.
  github?: GitHubSource
  marked?: MarkedLines
}

// A file as the browser sends it: a GitHub file goes without its code, which
// the server fetches from GitHub.
export type FileRequest = Omit<CodeFile, "code"> & { code?: string }

export const MAX_FILES = 5
export const MAX_FILE_CHARS = 20000
// A file from GitHub can be bigger than one written here. All of a post's
// files together stay within what five written files can reach.
export const MAX_GITHUB_FILE_CHARS = 100000
export const MAX_POST_CHARS = 100000
export const MAX_FILE_NAME = 100
// The feed shows this many lines of a file, then "Show all".
export const FEED_LINES = 20
// A marked file opens on its marked lines with this many lines either side.
export const CONTEXT_LINES = 3

export const TOO_MANY_FILES = "A post can have up to 5 files"
export const NAME_NEEDED = "Give each file a name"
export const SAME_NAME = "Two files can't have the same name"
export const FILE_TOO_LONG = "Each file can be up to 20,000 characters"
export const EMPTY_FILE = "A file can't be empty"
export const BAD_NAME = "File names can be up to 100 characters, without / or \\"
export const UNKNOWN_LANGUAGE = "Choose a language from the list"
export const BAD_FILES = "Files must be a list of { name, language, code }"
export const GITHUB_FILE_TOO_LONG = "This file is over 100,000 characters"
export const POST_TOO_LONG = "A post's files can add up to 100,000 characters"
export const BAD_MARKS = "Marked lines must be inside the file"
export const MARKS_GITHUB_ONLY = "Only files from GitHub can have marked lines"
export const BAD_SOURCE = "Files from GitHub need an owner, a repository, a full commit and a path"

export interface Language {
  id: string
  label: string
  // Prism's name for its grammar, and Monaco's for its language.
  prism: string
  monaco: string
  // Lower-case, with the dot. A file named Dockerfile is matched by name.
  extensions: string[]
}

// The ids the old form stored (javascript, typescript, jsx, html, css,
// python, java, csharp) keep their meaning. Plain text comes last: files from
// GitHub that no other language claims start as Plain text.
export const LANGUAGES: Language[] = [
  { id: "javascript", label: "JavaScript", prism: "javascript", monaco: "javascript", extensions: [".js", ".mjs", ".cjs"] },
  { id: "typescript", label: "TypeScript", prism: "typescript", monaco: "typescript", extensions: [".ts", ".mts", ".cts"] },
  { id: "jsx", label: "JSX", prism: "jsx", monaco: "javascript", extensions: [".jsx"] },
  { id: "tsx", label: "TSX", prism: "tsx", monaco: "typescript", extensions: [".tsx"] },
  { id: "html", label: "HTML", prism: "markup", monaco: "html", extensions: [".html", ".htm"] },
  { id: "css", label: "CSS", prism: "css", monaco: "css", extensions: [".css"] },
  { id: "scss", label: "SCSS", prism: "scss", monaco: "scss", extensions: [".scss"] },
  { id: "json", label: "JSON", prism: "json", monaco: "json", extensions: [".json"] },
  { id: "python", label: "Python", prism: "python", monaco: "python", extensions: [".py"] },
  { id: "java", label: "Java", prism: "java", monaco: "java", extensions: [".java"] },
  { id: "csharp", label: "C#", prism: "csharp", monaco: "csharp", extensions: [".cs"] },
  { id: "c", label: "C", prism: "c", monaco: "c", extensions: [".c", ".h"] },
  { id: "cpp", label: "C++", prism: "cpp", monaco: "cpp", extensions: [".cpp", ".cc", ".cxx", ".hpp", ".hh"] },
  { id: "go", label: "Go", prism: "go", monaco: "go", extensions: [".go"] },
  { id: "rust", label: "Rust", prism: "rust", monaco: "rust", extensions: [".rs"] },
  { id: "php", label: "PHP", prism: "php", monaco: "php", extensions: [".php"] },
  { id: "ruby", label: "Ruby", prism: "ruby", monaco: "ruby", extensions: [".rb"] },
  { id: "kotlin", label: "Kotlin", prism: "kotlin", monaco: "kotlin", extensions: [".kt", ".kts"] },
  { id: "swift", label: "Swift", prism: "swift", monaco: "swift", extensions: [".swift"] },
  { id: "dart", label: "Dart", prism: "dart", monaco: "dart", extensions: [".dart"] },
  { id: "sql", label: "SQL", prism: "sql", monaco: "sql", extensions: [".sql"] },
  { id: "bash", label: "Bash", prism: "bash", monaco: "shell", extensions: [".sh", ".bash"] },
  { id: "yaml", label: "YAML", prism: "yaml", monaco: "yaml", extensions: [".yml", ".yaml"] },
  { id: "markdown", label: "Markdown", prism: "markdown", monaco: "markdown", extensions: [".md", ".markdown"] },
  { id: "dockerfile", label: "Dockerfile", prism: "docker", monaco: "dockerfile", extensions: [".dockerfile"] },
  { id: "graphql", label: "GraphQL", prism: "graphql", monaco: "graphql", extensions: [".graphql", ".gql"] },
  { id: "text", label: "Plain text", prism: "plain", monaco: "plaintext", extensions: [".txt"] },
]

export function languageById(id: string): Language | undefined {
  return LANGUAGES.find((language) => language.id === id)
}

// What to call a language. An old post may name one the list doesn't have;
// it is shown as it was stored.
export function languageLabel(id: string): string {
  return languageById(id)?.label ?? id
}

// The language a file name points to, or null when the name doesn't say.
export function guessLanguage(name: string): string | null {
  const lower = name.trim().toLowerCase()
  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) return "dockerfile"
  const dot = lower.lastIndexOf(".")
  if (dot === -1) return null
  const extension = lower.slice(dot)
  return LANGUAGES.find((language) => language.extensions.includes(extension))?.id ?? null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// GitHub's naming rules. Owners: letters, digits and hyphens, up to 39, not
// starting with a hyphen. Repositories: letters, digits, ".", "_" and "-".
// Commits: the full 40 characters GitHub returns.
export const OWNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/
export const COMMIT_PATTERN = /^[0-9a-f]{40}$/
const MAX_PATH = 1000

export function isRepoName(name: string): boolean {
  return REPO_PATTERN.test(name) && name !== "." && name !== ".."
}

// A path inside a repository: no empty, "." or ".." segments and no control
// characters, so it can only ever name something in that repository.
export function isRepoPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= MAX_PATH &&
    !/[\u0000-\u001f]/.test(path) &&
    path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  )
}

// A GitHub source as a request sent it, checked, or null.
export function parseGitHubSource(value: unknown): GitHubSource | null {
  if (!isRecord(value)) return null
  const { owner, repo, commit, path } = value
  if (typeof owner !== "string" || typeof repo !== "string" || typeof commit !== "string" || typeof path !== "string") return null
  if (!OWNER_PATTERN.test(owner) || !isRepoName(repo) || !COMMIT_PATTERN.test(commit) || !isRepoPath(path)) return null
  return { owner, repo, commit, path }
}

const isLine = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1

// Marked lines as a request sent them, checked against the file's lines, or null.
function parseMarks(value: unknown, lineCount: number): MarkedLines | null {
  if (!isRecord(value)) return null
  const { from, to } = value
  if (!isLine(from) || !isLine(to) || from > to || to > lineCount) return null
  return { from, to }
}

// Checks the files a code post was sent with: the files to store, or the
// first problem in words a person can act on. Names are trimmed (a missing
// one counts as empty); code is kept exactly as written. A file from GitHub
// arrives here with the code the server fetched for it (lib/github.ts).
export function parseFiles(value: unknown): { files: CodeFile[] } | { error: string } {
  if (!Array.isArray(value) || value.length === 0) return { error: BAD_FILES }
  if (value.length > MAX_FILES) return { error: TOO_MANY_FILES }
  const files: CodeFile[] = []
  for (const item of value) {
    if (!isRecord(item)) return { error: BAD_FILES }
    const { name = "", language, code } = item
    if (typeof name !== "string" || typeof language !== "string" || typeof code !== "string") return { error: BAD_FILES }
    const trimmed = name.trim()
    if (trimmed.length > MAX_FILE_NAME || /[/\\]/.test(trimmed)) return { error: BAD_NAME }
    if (!languageById(language)) return { error: UNKNOWN_LANGUAGE }
    let github: GitHubSource | null = null
    if (item.github != null) {
      github = parseGitHubSource(item.github)
      if (!github) return { error: BAD_SOURCE }
    }
    if (!code.trim()) return { error: EMPTY_FILE }
    if (code.length > (github ? MAX_GITHUB_FILE_CHARS : MAX_FILE_CHARS)) {
      return { error: github ? GITHUB_FILE_TOO_LONG : FILE_TOO_LONG }
    }
    const file: CodeFile = { name: trimmed, language, code }
    if (github) file.github = github
    if (item.marked != null) {
      if (!github) return { error: MARKS_GITHUB_ONLY }
      const marked = parseMarks(item.marked, displayLines(code).length)
      if (!marked) return { error: BAD_MARKS }
      file.marked = marked
    }
    files.push(file)
  }
  if (files.length > 1 && files.some((file) => !file.name)) return { error: NAME_NEEDED }
  if (new Set(files.map((file) => file.name)).size < files.length) return { error: SAME_NAME }
  if (files.reduce((total, file) => total + file.code.length, 0) > MAX_POST_CHARS) return { error: POST_TOO_LONG }
  return { files }
}

// A post's code as files. Posts from before files keep `code` and
// `language` and read as one file with no name (JavaScript when they never
// said which language).
export function postFiles(post: { files?: CodeFile[]; code?: string; language?: string }): CodeFile[] {
  if (post.files && post.files.length > 0) return post.files
  if (post.code) return [{ name: "", language: post.language || "javascript", code: post.code }]
  return []
}

// The lines a file shows. Windows line endings count as one break, and a
// final line break doesn't add an empty last line.
export function displayLines(code: string): string[] {
  const text = code.replace(/\r\n?/g, "\n")
  return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n")
}

// The lines a marked file opens on: the mark and CONTEXT_LINES either side,
// kept inside the file.
export function markedWindow(lineCount: number, marked: MarkedLines): { first: number; last: number } {
  return { first: Math.max(1, marked.from - CONTEXT_LINES), last: Math.min(lineCount, marked.to + CONTEXT_LINES) }
}

// What a click on a line number does to the mark: a click marks that line
// (or clears the mark when that line is all it holds); a shift-click
// stretches the mark from where it starts to that line.
export function markFromClick(current: MarkedLines | null, line: number, shift: boolean): MarkedLines | null {
  if (shift && current) return { from: Math.min(current.from, line), to: Math.max(current.from, line) }
  if (current && current.from === line && current.to === line) return null
  return { from: line, to: line }
}

// The Lines boxes: both empty clears the mark, one number marks that line,
// two mark the lines between them in either order. undefined when they can't
// be read, so the mark stays as it was.
export function parseMarkInput(fromText: string, toText: string): MarkedLines | null | undefined {
  const read = (text: string): number | null => {
    const trimmed = text.trim()
    if (!trimmed) return null
    return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN
  }
  const from = read(fromText)
  const to = read(toText)
  if (Number.isNaN(from) || Number.isNaN(to)) return undefined
  if (from === null && to === null) return null
  const a = from ?? (to as number)
  const b = to ?? (from as number)
  if (a < 1 || b < 1) return undefined
  return { from: Math.min(a, b), to: Math.max(a, b) }
}

// What a screen reader hears before a marked file's code.
export function markedLabel(marked: MarkedLines): string {
  return marked.from === marked.to ? `Marked line ${marked.from}` : `Marked lines ${marked.from} to ${marked.to}`
}
