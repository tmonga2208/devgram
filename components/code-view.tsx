"use client"

import { useCallback, useState } from "react"
import { Copy, ExternalLink, Play, Square } from "lucide-react"
import toast from "react-hot-toast"
import { CodeRun } from "@/components/code-run"
import { GitHubMark } from "@/components/github-mark"
import { HighlightedCode } from "@/components/highlighted-code"
import { FEED_LINES, displayLines, languageLabel, markedLabel, markedWindow, type CodeFile } from "@/lib/code-files"
import { runKind } from "@/lib/code-run"
import { githubFileUrl } from "@/lib/github-links"
import { cn } from "@/lib/utils"

export const COPY_FAILED = "Couldn't copy — select the code instead"

// The header's buttons: at least 44px tall on phones.
const headerButton =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white md:min-h-9"

interface CodeViewProps {
  files: CodeFile[]
  // In the feed, what's shown of a file folds at 20 lines.
  fold?: boolean
}

// Where a GitHub file came from, and a link to it there, at its commit.
function GitHubSource({ file }: { file: CodeFile }) {
  if (!file.github) return null
  const label = `${file.github.owner}/${file.github.repo} · ${file.github.path}`
  return (
    <div data-github-source className="flex items-center gap-2 border-b border-zinc-800 pl-3 pr-1 text-sm text-zinc-400">
      <GitHubMark className="h-4 w-4 shrink-0" />
      <span data-github-label title={label} className="min-w-0 flex-1 truncate">
        {label}
      </span>
      <a href={githubFileUrl(file.github, file.marked)} target="_blank" rel="noopener noreferrer" data-github-view className={headerButton}>
        View on GitHub
        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

// A row standing for lines the view leaves out.
function HiddenLines() {
  return (
    <div aria-hidden="true" data-hidden-lines className="select-none bg-zinc-900 px-3 text-xs leading-5 text-zinc-500">
      ⋯
    </div>
  )
}

// A code post's files, the same in the feed and on the post page: a tab per
// file (or the one file's name or language), Copy, Run where the files can
// run, line numbers and colours. A GitHub file adds where it came from, and
// one with marked lines opens on them.
export function CodeView({ files, fold = false }: CodeViewProps) {
  const [active, setActive] = useState(0)
  // Show all (or Show whole file) was pressed: every line shows.
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  // Each Run starts a new frame; `running` turns off when a JavaScript run ends.
  const [run, setRun] = useState<{ id: number; running: boolean } | null>(null)
  const canRun = runKind(files) !== null
  const toggleRun = () => setRun((current) => (current?.running ? null : { id: (current?.id ?? 0) + 1, running: true }))
  const finished = useCallback(
    (id: number) => setRun((current) => (current?.id === id ? { id, running: false } : current)),
    [],
  )
  const current = Math.min(active, files.length - 1)
  const file = files[current]
  const lineCount = displayLines(file.code).length
  const marked = file.marked ?? null
  // A marked file opens on its marks with lines either side; others start at
  // the top. In the feed, what's shown folds at 20 lines.
  const range = marked && !expanded ? markedWindow(lineCount, marked) : { first: 1, last: lineCount }
  const first = range.first
  const last = fold && !expanded ? Math.min(range.last, first + FEED_LINES - 1) : range.last
  const cut = first > 1 || last < lineCount

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(COPY_FAILED)
    }
  }

  return (
    <div data-code-view className="w-full overflow-hidden bg-zinc-950 text-zinc-200">
      <div className="flex items-center gap-1 border-b border-zinc-800 px-1">
        {files.length > 1 ? (
          <div
            role="tablist"
            aria-label="Files"
            className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {files.map((item, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={index === current}
                data-file-tab
                onClick={() => setActive(index)}
                className={cn(
                  "min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 text-sm md:min-h-9",
                  index === current ? "border-sky-400 text-white" : "border-transparent text-zinc-400 hover:text-zinc-200",
                )}
              >
                {item.name}
              </button>
            ))}
          </div>
        ) : (
          <span className="min-w-0 flex-1 truncate px-3 text-sm text-zinc-400">{file.name || languageLabel(file.language)}</span>
        )}
        <button type="button" data-copy onClick={copy} className={headerButton}>
          {copied ? (
            "Copied ✓"
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy
            </>
          )}
        </button>
        {canRun && (
          <button type="button" data-run onClick={toggleRun} className={headerButton}>
            {run?.running ? (
              <>
                <Square className="h-4 w-4" />
                Stop
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run
              </>
            )}
          </button>
        )}
      </div>
      <GitHubSource file={file} />
      {marked && (
        <p data-marked-label className="sr-only">
          {markedLabel(marked)}
        </p>
      )}
      {marked && first > 1 && <HiddenLines />}
      <HighlightedCode code={file.code} language={file.language} first={first} last={last} marked={marked} />
      {marked && last < lineCount && <HiddenLines />}
      {cut && (
        <button
          type="button"
          data-show-all
          onClick={() => setExpanded(true)}
          className="min-h-11 w-full border-t border-zinc-800 text-sm text-sky-400 hover:bg-zinc-900 md:min-h-9"
        >
          {marked ? `Show whole file (${lineCount} lines)` : "Show all"}
        </button>
      )}
      {run && <CodeRun key={run.id} files={files} onFinish={() => finished(run.id)} />}
    </div>
  )
}
