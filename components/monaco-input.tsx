"use client"

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react"
import Editor, { loader, type BeforeMount } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import { languageById } from "@/lib/code-files"

// Monaco's own files come from jsDelivr, pinned to the version whose types
// are installed (monaco-editor in devDependencies).
loader.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs" } })

// How long Monaco gets to appear before the plain box takes over.
const LOAD_TIMEOUT_MS = 10_000

// Code posts are snippets: TypeScript's type checks would flag every import
// and name a snippet can't see, so only syntax is checked, and JSX is allowed.
const configureTypeScript: BeforeMount = (monaco) => {
  const ts = monaco.typescript
  for (const defaults of [ts.typescriptDefaults, ts.javascriptDefaults]) {
    defaults.setCompilerOptions({ ...defaults.getCompilerOptions(), jsx: ts.JsxEmit.Preserve })
    defaults.setDiagnosticsOptions({ ...defaults.getDiagnosticsOptions(), noSemanticValidation: true })
  }
}

// A file's model outlives the editor, so it can fall behind the file: edited
// in the plain box while the window was narrow, or under another language.
function catchUp(instance: editor.IStandaloneCodeEditor | null, value: string) {
  if (instance && instance.getValue() !== value) instance.setValue(value)
}

export interface MonacoInputProps {
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
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const latest = useRef(value)
  const info = languageById(language)
  // Monaco's TypeScript reads JSX only in a .tsx file, so a model's name ends
  // in its language's extension.
  const modelPath = `${path}${info?.extensions[0] ?? ""}`

  useLayoutEffect(() => {
    latest.current = value
  })

  // Runs after the editor has switched to the file's model.
  useEffect(() => {
    catchUp(editorRef.current, latest.current)
  }, [modelPath])

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
        path={modelPath}
        language={info?.monaco ?? "plaintext"}
        value={value}
        onChange={(next) => onChange(next ?? "")}
        beforeMount={configureTypeScript}
        onMount={(instance) => {
          ready.current = true
          editorRef.current = instance
          catchUp(instance, latest.current)
        }}
        loading={loading}
        options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }}
      />
    </div>
  )
}
