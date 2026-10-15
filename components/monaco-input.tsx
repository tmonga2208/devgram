"use client"

import { useEffect, useRef, type ReactNode } from "react"
import Editor, { loader } from "@monaco-editor/react"
import { languageById } from "@/lib/code-files"

// Monaco's own files come from jsDelivr, pinned to the version whose types
// are installed (monaco-editor in devDependencies).
loader.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs" } })

// How long Monaco gets to appear before the plain box takes over.
const LOAD_TIMEOUT_MS = 10_000

interface MonacoInputProps {
  // One model per file, so each keeps its own code and undo history.
  path: string
  language: string
  value: string
  onChange: (value: string) => void
  // Monaco didn't load, or took more than 10 seconds.
  onFail: () => void
  loading: ReactNode
}

// VS Code's editor, for computers. Loaded only when Create's Code tab opens
// on one.
export default function MonacoInput({ path, language, value, onChange, onFail, loading }: MonacoInputProps) {
  const ready = useRef(false)

  useEffect(() => {
    const init = loader.init()
    init.catch((error: { type?: string } | undefined) => {
      if (error?.type !== "cancelation") onFail()
    })
    const timer = window.setTimeout(() => {
      if (!ready.current) onFail()
    }, LOAD_TIMEOUT_MS)
    return () => {
      window.clearTimeout(timer)
      init.cancel()
    }
  }, [onFail])

  return (
    <div className="overflow-hidden rounded-md border">
      <Editor
        height="320px"
        theme="vs-dark"
        path={path}
        language={languageById(language)?.monaco ?? "plaintext"}
        value={value}
        onChange={(next) => onChange(next ?? "")}
        onMount={() => {
          ready.current = true
        }}
        loading={loading}
        options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }}
      />
    </div>
  )
}
