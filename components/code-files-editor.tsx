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
import { HighlightedCode } from "@/components/highlighted-code"
import type { MonacoInputProps } from "@/components/monaco-input"
import { LANGUAGES, MAX_FILES, MAX_FILE_NAME, guessLanguage, languageLabel, type CodeFile } from "@/lib/code-files"
import { cn } from "@/lib/utils"

// A file being written. Its key stays the same through renames.
export interface DraftFile extends CodeFile {
  key: number
}

let lastKey = 0
export function newDraftFile(language = "javascript"): DraftFile {
  lastKey += 1
  return { key: lastKey, name: "", language, code: "" }
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
}

// Create's Code tab: up to 5 files as tabs, each with a name, a language
// (guessed from the name, or picked) and its code.
export function CodeFilesEditor({ files, onChange }: CodeFilesEditorProps) {
  const [active, setActive] = useState(0)
  const current = Math.min(active, files.length - 1)
  const file = files[current]
  const computer = useMediaQuery(COMPUTER)
  const [monacoFailed, setMonacoFailed] = useState(false)
  const onMonacoFail = useCallback(() => setMonacoFailed(true), [])

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
  const remove = () => {
    onChange(files.filter((_, index) => index !== current))
    setActive(Math.max(0, current - 1))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div
          role="tablist"
          aria-label="Files"
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                "min-h-11 shrink-0 whitespace-nowrap rounded-md border px-3 text-sm md:min-h-9",
                index === current
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-muted-foreground hover:text-foreground",
              )}
            >
              {item.name || (files.length > 1 ? "Untitled" : languageLabel(item.language))}
            </button>
          ))}
        </div>
        <Button type="button" variant="outline" onClick={add} disabled={files.length >= MAX_FILES} className="min-h-11 shrink-0 md:min-h-9">
          <Plus className="h-4 w-4" />
          Add file
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
      {computer && !monacoFailed ? (
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
      {files.length > 1 && (
        <Button type="button" variant="ghost" onClick={remove} className="min-h-11 text-destructive md:min-h-9">
          <Trash2 className="h-4 w-4" />
          Remove {file.name || "this file"}
        </Button>
      )}
    </div>
  )
}
