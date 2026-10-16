"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { GitHubFilePanel } from "@/components/github-file-panel"
import { GitHubMark } from "@/components/github-mark"
import { GitHubPicker, type PickedFile } from "@/components/github-picker"
import { HighlightedCode } from "@/components/highlighted-code"
import type { MonacoInputProps } from "@/components/monaco-input"
import { LANGUAGES, MAX_FILES, MAX_FILE_NAME, guessLanguage, languageLabel, type CodeFile } from "@/lib/code-files"
import { cn } from "@/lib/utils"

// A file being written, or one taken from GitHub. Its key stays the same
// through renames.
export interface DraftFile extends CodeFile {
  key: number
}

let lastKey = 0
// A new draft file. `fields` fills it in (a file from GitHub, or one kept
// while connecting GitHub); its key is always a new one.
export function newDraftFile(language = "javascript", fields: Partial<CodeFile> = {}): DraftFile {
  lastKey += 1
  return { name: "", language, code: "", ...fields, key: lastKey }
}

export const EDITOR_FAILED = "The full editor couldn't load — you can still write here."
// A mouse or trackpad, and a screen at least 768px wide: Monaco doesn't work
// in phone browsers.
const COMPUTER = "(pointer: fine) and (min-width: 768px)"

const editorLoading = (
  <div className="flex h-80 items-center justify-center rounded-md border bg-zinc-950 text-sm text-zinc-400">Loading editor…</div>
)

// Monaco's code, and Monaco itself from jsDelivr, load only when a computer
// opens the Code tab. If that code can't load (a deploy replaced it, say), the
// plain box takes over instead of the page breaking.
const MonacoInput = dynamic<MonacoInputProps>(
  () =>
    import("@/components/monaco-input").catch(() => ({
      default: function MonacoMissing({ onFail }: MonacoInputProps) {
        useEffect(() => onFail(), [onFail])
        return null
      },
    })),
  { ssr: false, loading: () => editorLoading },
)

// The plain code box: what phones get. Nothing in it second-guesses what
// you type, and a highlighted copy of the code shows under it.
function PlainCodeBox({ file, onCode, note }: { file: CodeFile; onCode: (code: string) => void; note?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="code">Code</Label>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      <Textarea
        id="code"
        placeholder="Paste or write your code here..."
        className="max-h-[60vh] min-h-[200px] font-mono"
        value={file.code}
        onChange={(event) => onCode(event.target.value)}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
      />
      {file.code && (
        <div data-code-preview className="max-h-80 overflow-auto rounded-md border">
          <HighlightedCode code={file.code} language={file.language} />
        </div>
      )}
    </div>
  )
}

interface CodeFilesEditorProps {
  files: DraftFile[]
  onChange: (files: DraftFile[]) => void
  // Leaves for GitHub to connect, keeping the post as it is.
  onConnectGitHub: () => void
}

// Create's Code tab: up to 5 files as tabs. Each is written here (a name, a
// language guessed from the name or picked, and its code) or taken from
// GitHub (read-only, with marked lines).
export function CodeFilesEditor({ files, onChange, onConnectGitHub }: CodeFilesEditorProps) {
  const [active, setActive] = useState(0)
  const [picking, setPicking] = useState(false)
  const current = Math.min(active, files.length - 1)
  const file = files[current]
  const computer = useMediaQuery(COMPUTER)
  const [monacoFailed, setMonacoFailed] = useState(false)
  const onMonacoFail = useCallback(() => setMonacoFailed(true), [])
  const full = files.length >= MAX_FILES

  const update = (changes: Partial<CodeFile>) =>
    onChange(files.map((item, index) => (index === current ? { ...item, ...changes } : item)))
  const rename = (name: string) => {
    const guessed = guessLanguage(name)
    update(guessed ? { name, language: guessed } : { name })
  }
  const add = () => {
    onChange([...files, newDraftFile(file.language)])
    setActive(files.length)
  }
  // A file from GitHub takes the place of a single empty, unnamed file.
  const addFromGitHub = (picked: PickedFile) => {
    const draft = newDraftFile(picked.language, {
      name: picked.name,
      code: picked.code,
      github: picked.github,
      ...(picked.marked ? { marked: picked.marked } : {}),
    })
    const empty = files.length === 1 && !files[0].name && !files[0].code && !files[0].github
    onChange(empty ? [draft] : [...files, draft])
    setActive(empty ? 0 : files.length)
  }
  // Removing the only file leaves an empty one to write in.
  const remove = () => {
    onChange(files.length > 1 ? files.filter((_, index) => index !== current) : [newDraftFile()])
    setActive(Math.max(0, current - 1))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Files"
          className="flex w-full min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] sm:w-auto sm:flex-1 [&::-webkit-scrollbar]:hidden"
        >
          {files.map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={index === current}
              data-file-tab
              onClick={() => setActive(index)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-sm md:min-h-9",
                index === current
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-muted-foreground hover:text-foreground",
              )}
            >
              {item.github && <GitHubMark className="h-3.5 w-3.5 shrink-0" />}
              {item.name || (files.length > 1 ? "Untitled" : languageLabel(item.language))}
            </button>
          ))}
        </div>
        <Button type="button" variant="outline" onClick={add} disabled={full} className="min-h-11 shrink-0 md:min-h-9">
          <Plus className="h-4 w-4" />
          Add file
        </Button>
        <Button type="button" variant="outline" onClick={() => setPicking(true)} disabled={full} className="min-h-11 shrink-0 md:min-h-9">
          <GitHubMark className="h-4 w-4" />
          From GitHub
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="file-name">File name</Label>
          <Input
            id="file-name"
            value={file.name}
            maxLength={MAX_FILE_NAME}
            placeholder={files.length > 1 ? "app.js" : "Optional, like app.js"}
            onChange={(event) => rename(event.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="file-language">Language</Label>
          <Select value={file.language} onValueChange={(language) => update({ language })}>
            <SelectTrigger id="file-language" className="min-h-11 w-full md:min-h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((language) => (
                <SelectItem key={language.id} value={language.id}>
                  {language.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {file.github ? (
        <GitHubFilePanel file={file} source={file.github} onMarked={(marked) => update({ marked: marked ?? undefined })} />
      ) : computer && !monacoFailed ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Code</p>
          <MonacoInput
            path={`file-${file.key}`}
            language={file.language}
            value={file.code}
            onChange={(code) => update({ code })}
            onFail={onMonacoFail}
            loading={editorLoading}
          />
        </div>
      ) : (
        <PlainCodeBox file={file} onCode={(code) => update({ code })} note={monacoFailed ? EDITOR_FAILED : undefined} />
      )}
      {(files.length > 1 || file.github) && (
        <Button type="button" variant="ghost" onClick={remove} className="min-h-11 text-destructive md:min-h-9">
          <Trash2 className="h-4 w-4" />
          Remove {file.name || "this file"}
        </Button>
      )}
      <GitHubPicker open={picking} onOpenChange={setPicking} onPick={addFromGitHub} onConnect={onConnectGitHub} />
    </div>
  )
}
