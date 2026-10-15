import { Fragment } from "react"
import "prismjs/themes/prism-tomorrow.css"
import { displayLines } from "@/lib/code-files"
import { highlight, type Highlighted } from "@/lib/code-highlight"

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
  // Show only the first lines (the feed folds long files).
  maxLines?: number
}

// Code with a number on each line and Prism's colours. Long lines scroll
// sideways inside the block while the numbers stay put.
export function HighlightedCode({ code, language, maxLines }: HighlightedCodeProps) {
  const lines = displayLines(code).slice(0, maxLines)
  return (
    <div className="flex bg-zinc-950 font-mono text-[13px] leading-5 text-zinc-200">
      <div aria-hidden="true" data-line-numbers className="shrink-0 select-none border-r border-zinc-800 py-3 pl-3 pr-2 text-right text-zinc-500">
        {lines.map((_, index) => (
          <div key={index}>{index + 1}</div>
        ))}
      </div>
      <pre className="m-0 min-w-0 flex-1 overflow-x-auto px-3 py-3 [tab-size:4]">
        <code>
          <Pieces pieces={highlight(lines.join("\n"), language)} />
        </code>
      </pre>
    </div>
  )
}
