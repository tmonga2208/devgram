// Rules for the files in a code post, shared by the API and the browser. It
// imports nothing, so the unit tests load it in Node.

export interface CodeFile {
  name: string
  language: string
  code: string
}

export const MAX_FILES = 5
export const MAX_FILE_CHARS = 20000
export const MAX_FILE_NAME = 100
// The feed shows this many lines of a file, then "Show all".
export const FEED_LINES = 20

export const TOO_MANY_FILES = "A post can have up to 5 files"
export const NAME_NEEDED = "Give each file a name"
export const SAME_NAME = "Two files can't have the same name"
export const FILE_TOO_LONG = "Each file can be up to 20,000 characters"
export const EMPTY_FILE = "A file can't be empty"
export const BAD_NAME = "File names can be up to 100 characters, without / or \\"
export const UNKNOWN_LANGUAGE = "Choose a language from the list"
export const BAD_FILES = "Files must be a list of { name, language, code }"

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
// python, java, csharp) keep their meaning.
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

// Checks the files a code post was sent with: the files to store, or the
// first problem in words a person can act on. Names are trimmed (a missing
// one counts as empty); code is kept exactly as written.
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
    if (!code.trim()) return { error: EMPTY_FILE }
    if (code.length > MAX_FILE_CHARS) return { error: FILE_TOO_LONG }
    files.push({ name: trimmed, language, code })
  }
  if (files.length > 1 && files.some((file) => !file.name)) return { error: NAME_NEEDED }
  if (new Set(files.map((file) => file.name)).size < files.length) return { error: SAME_NAME }
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
