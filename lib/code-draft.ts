// The Code tab's post, kept in sessionStorage while you connect GitHub, so
// it's there again when GitHub sends you back. Storage can be blocked (some
// private windows); the post then simply starts empty.
import { MAX_FILES, type CodeFile } from "@/lib/code-files"

const KEY = "devgram:code-draft"

export interface CodeDraft {
  caption: string
  files: CodeFile[]
}

// A kept draft, checked: anything that isn't one reads as no draft.
export function readDraft(raw: string | null): CodeDraft | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const { caption, files } = value as { caption?: unknown; files?: unknown }
  if (typeof caption !== "string" || !Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) return null
  const isFile = (file: unknown) => {
    if (typeof file !== "object" || file === null) return false
    const { name, language, code } = file as Record<string, unknown>
    return typeof name === "string" && typeof language === "string" && typeof code === "string"
  }
  return files.every(isFile) ? { caption, files: files as CodeFile[] } : null
}

export function saveDraft(draft: CodeDraft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    // Storage is blocked: the post will start empty again.
  }
}

// The kept draft, once: reading it removes it.
export function takeDraft(): CodeDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return readDraft(raw)
  } catch {
    return null
  }
}
