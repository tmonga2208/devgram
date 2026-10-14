"use client"

import { useRef } from "react"
import { ImageIcon, VideoIcon, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface MediaPickerProps {
  kind: "image" | "video"
  previewUrl: string | null
  // 0-100 while a file is uploading, otherwise null.
  progress: number | null
  // A line under the preview, such as "Uploading 40%" or "Processing video…".
  status: string | null
  error: string | null
  onSelect: (file: File) => void
  onClear: () => void
}

// The choose / preview / progress / change block of the Create form.
export function MediaPicker({ kind, previewUrl, progress, status, error, onSelect, onClear }: MediaPickerProps) {
  const input = useRef<HTMLInputElement>(null)
  const Icon = kind === "image" ? ImageIcon : VideoIcon

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept={kind === "image" ? "image/*" : "video/*"}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Lets the same file be chosen again after removing it.
          event.target.value = ""
          if (file) onSelect(file)
        }}
      />
      {previewUrl ? (
        <div className="relative overflow-hidden rounded-lg border bg-muted">
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
            <img src={previewUrl} alt="Chosen photo" className="max-h-96 w-full object-contain" />
          ) : (
            <video src={previewUrl} className="max-h-96 w-full" muted playsInline controls />
          )}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute right-2 top-2"
            onClick={onClear}
            aria-label={kind === "image" ? "Remove photo" : "Remove video"}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-muted-foreground transition-colors hover:bg-muted/50"
        >
          <Icon className="h-8 w-8" />
          <span className="font-medium">{kind === "image" ? "Choose photo" : "Choose video"}</span>
        </button>
      )}
      {progress !== null && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {previewUrl && (
        <Button type="button" variant="link" className="h-auto p-0" onClick={() => input.current?.click()}>
          Change
        </Button>
      )}
    </div>
  )
}
