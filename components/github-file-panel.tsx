"use client"

import { useEffect, useState, type KeyboardEvent } from "react"
import { GitHubMark } from "@/components/github-mark"
import { HighlightedCode } from "@/components/highlighted-code"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { markFromClick, parseMarkInput, type CodeFile, type GitHubSource, type MarkedLines } from "@/lib/code-files"

interface GitHubFilePanelProps {
  file: CodeFile
  source: GitHubSource
  onMarked: (marked: MarkedLines | null) => void
}

// A GitHub file in the Code tab: where it's from, its code (read-only, so the
// post shows exactly what's on GitHub at that commit) and the lines it points
// out. Click a line number to mark it, shift-click to stretch the mark, or
// type in the Lines boxes.
export function GitHubFilePanel({ file, source, onMarked }: GitHubFilePanelProps) {
  const marked = file.marked ?? null
  const from = marked?.from
  const to = marked?.to
  const [fromText, setFromText] = useState(from ? String(from) : "")
  const [toText, setToText] = useState(to ? String(to) : "")

  // The boxes follow the mark when a click changes it.
  useEffect(() => {
    setFromText(from ? String(from) : "")
    setToText(to ? String(to) : "")
  }, [from, to])

  // The boxes take effect when you leave them or press Enter. A range they
  // can't read puts back the mark as it was.
  const commit = () => {
    const next = parseMarkInput(fromText, toText)
    if (next === undefined || (next?.from === from && next?.to === to)) {
      setFromText(from ? String(from) : "")
      setToText(to ? String(to) : "")
      return
    }
    onMarked(next)
  }
  const commitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    commit()
  }
  const label = `${source.owner}/${source.repo} · ${source.path}`

  return (
    <div data-github-file className="space-y-3">
      <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <GitHubMark className="h-4 w-4 shrink-0" />
        <span data-github-label title={label} className="min-w-0 truncate">
          {label}
        </span>
      </p>
      <p className="text-sm text-muted-foreground">Code from GitHub can&apos;t be edited.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="marked-from">Lines</Label>
          <Input
            id="marked-from"
            inputMode="numeric"
            autoComplete="off"
            value={fromText}
            onChange={(event) => setFromText(event.target.value)}
            onBlur={commit}
            onKeyDown={commitOnEnter}
            className="min-h-11 w-24 md:min-h-9"
          />
        </div>
        <span className="pb-3 text-sm text-muted-foreground md:pb-2">to</span>
        <div className="space-y-1">
          <Label htmlFor="marked-to" className="sr-only">
            Last line
          </Label>
          <Input
            id="marked-to"
            inputMode="numeric"
            autoComplete="off"
            value={toText}
            onChange={(event) => setToText(event.target.value)}
            onBlur={commit}
            onKeyDown={commitOnEnter}
            className="min-h-11 w-24 md:min-h-9"
          />
        </div>
        <Button type="button" variant="ghost" onClick={() => onMarked(null)} disabled={!marked} className="min-h-11 md:min-h-9">
          Clear
        </Button>
      </div>
      <div className="max-h-[60vh] overflow-auto rounded-md border">
        <HighlightedCode
          code={file.code}
          language={file.language}
          marked={marked}
          onLineClick={(line, shift) => onMarked(markFromClick(marked, line, shift))}
        />
      </div>
    </div>
  )
}
