"use client"

import { useLayoutEffect, useRef, useState } from "react"
import type { CodeFile } from "@/lib/code-files"
import {
  FLOODED,
  RUN_SECONDS,
  STOPPED,
  appendLines,
  buildRunDocument,
  messageBudget,
  readRunMessage,
  runKind,
  type RunLevel,
  type RunLine,
} from "@/lib/code-run"
import { cn } from "@/lib/utils"

const LINE_COLOURS: Record<RunLevel, string> = {
  log: "text-zinc-200",
  info: "text-sky-300",
  warn: "text-amber-300",
  error: "text-red-400",
}

interface CodeRunProps {
  files: CodeFile[]
  // A JavaScript run has ended: it finished, or was stopped after 5 seconds.
  // A page runs until the code view removes it.
  onFinish: () => void
}

// One run of a post's code. The frame may run scripts and nothing else: it
// gets no access to Devgram's storage, cookies or sign-in, can't open popups
// and can't move the page.
export function CodeRun({ files, onFinish }: CodeRunProps) {
  const frame = useRef<HTMLIFrameElement>(null)
  const output = useRef<HTMLDivElement>(null)
  const finish = useRef(onFinish)
  // A post's files don't change while it runs.
  const [kind] = useState(() => runKind(files))
  const [srcDoc] = useState(() => buildRunDocument(files))
  const [lines, setLines] = useState<RunLine[]>([])
  const [ended, setEnded] = useState(false)
  // A JavaScript run's frame, and the worker in it, go away after 5 seconds.
  const [frameLive, setFrameLive] = useState(true)

  useLayoutEffect(() => {
    finish.current = onFinish
  })

  // Listening starts before the frame can send anything: layout effects run
  // before the browser goes back to loading the frame.
  useLayoutEffect(() => {
    let done = false
    let flooded = false
    const allow = messageBudget()
    const end = () => {
      done = true
      setEnded(true)
      finish.current()
    }
    const onMessage = (event: MessageEvent) => {
      if (flooded || !frame.current || event.source !== frame.current.contentWindow) return
      // Counted before the message is read: code that posts messages itself,
      // thousands a second, is stopped instead of being read.
      if (!allow(performance.now())) {
        flooded = true
        setFrameLive(false)
        setLines((current) => appendLines(current, [{ level: "error", text: FLOODED }]))
        if (!done) end()
        return
      }
      const message = readRunMessage(event.data)
      if (!message) return
      if ("lines" in message) setLines((current) => appendLines(current, message.lines))
      else if (kind === "script" && !done) end()
    }
    window.addEventListener("message", onMessage)
    const timer =
      kind === "script"
        ? window.setTimeout(() => {
            setFrameLive(false)
            if (done) return
            setLines((current) => appendLines(current, [{ level: "error", text: STOPPED }]))
            end()
          }, RUN_SECONDS * 1000)
        : undefined
    return () => {
      window.removeEventListener("message", onMessage)
      window.clearTimeout(timer)
    }
  }, [kind])

  // The newest output stays in view.
  useLayoutEffect(() => {
    if (output.current) output.current.scrollTop = output.current.scrollHeight
  }, [lines])

  if (!srcDoc) return null
  return (
    <div className="border-t border-zinc-800">
      {frameLive && (
        <iframe
          ref={frame}
          title={kind === "page" ? "Preview" : "JavaScript run"}
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          className={kind === "page" ? "block h-72 w-full bg-white" : "hidden"}
        />
      )}
      {(kind === "script" || lines.length > 0) && (
        <div ref={output} data-run-output className="max-h-64 overflow-auto px-3 py-2 font-mono text-xs leading-5">
          {lines.map((line, index) => (
            <div key={index} data-run-line data-level={line.level} className={cn("whitespace-pre-wrap break-words", LINE_COLOURS[line.level])}>
              {line.text}
            </div>
          ))}
          {lines.length === 0 && <p className="text-zinc-500">{ended ? "No output" : "Running…"}</p>}
        </div>
      )}
    </div>
  )
}
