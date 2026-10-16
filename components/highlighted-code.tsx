import { Fragment, useMemo } from "react"
import "prismjs/themes/prism-tomorrow.css"
import type { MarkedLines } from "@/lib/code-files"
import { highlightLines, type Highlighted } from "@/lib/code-highlight"
import { cn } from "@/lib/utils"

function Pieces({ pieces }: { pieces: Highlighted[] }) {
  return (
    <>
      {pieces.map((piece, index) =>
        typeof piece === "string" ? (
          <Fragment key={index}>{piece}</Fragment>
        ) : (
          <span key={index} className={piece.classes}>
            <Pieces pieces={piece.content} />
          </span>
        ),
      )}
    </>
  )
}

interface HighlightedCodeProps {
  code: string
  language: string
  // Show only these lines, counted from 1, both included; all by default.
  first?: number
  last?: number
  // Lines to tint, with a bar by their numbers.
  marked?: MarkedLines | null
  // Makes the line numbers buttons, for marking lines in the Code tab.
  onLineClick?: (line: number, shift: boolean) => void
}

// Code with a number on each line and Prism's colours. Long lines scroll
// sideways inside the block while the numbers stay put. Each line spans the
// block's whole width, so a marked line's tint does too.
export function HighlightedCode({ code, language, first = 1, last, marked, onLineClick }: HighlightedCodeProps) {
  // Only the lines up to the last one shown are worked out: the feed shows 20.
  const lines = useMemo(() => highlightLines(code, language, last), [code, language, last])
  const shown = lines.slice(first - 1)
  const isMarked = (line: number) => Boolean(marked && line >= marked.from && line <= marked.to)
  return (
    <div className="flex bg-zinc-950 font-mono text-[13px] leading-5 text-zinc-200">
      <div aria-hidden="true" data-line-numbers className="shrink-0 select-none border-r border-zinc-800 py-3 text-right text-zinc-500">
        {shown.map((_, index) => {
          const line = first + index
          const mark = isMarked(line)
          const style = cn(
            "block w-full border-l-2 pl-3 pr-2 text-right",
            mark ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-transparent",
          )
          return onLineClick ? (
            <button
              key={line}
              type="button"
              tabIndex={-1}
              data-line={line}
              data-marked={mark || undefined}
              className={cn(style, "hover:text-zinc-100")}
              onClick={(event) => onLineClick(line, event.shiftKey)}
            >
              {line}
            </button>
          ) : (
            <div key={line} data-marked={mark || undefined} className={style}>
              {line}
            </div>
          )
        })}
      </div>
      <pre className="m-0 min-w-0 flex-1 overflow-x-auto py-3 [tab-size:4]">
        <code className="block w-max min-w-full">
          {shown.map((pieces, index) => (
            <Fragment key={first + index}>
              {index > 0 && "\n"}
              <span className={cn("inline-block min-h-5 min-w-full px-3 align-top", isMarked(first + index) && "bg-amber-400/15")}>
                <Pieces pieces={pieces} />
              </span>
            </Fragment>
          ))}
        </code>
      </pre>
    </div>
  )
}
