"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { preparePhoto } from "@/lib/image-prepare"
import { UPLOAD_FAILED, uploadPhoto } from "@/lib/upload-client"

// "Upload photo" for the profile picture: uploads the chosen file and hands
// back its URL; saving the profile stores it. onBusyChange tells the form when
// an upload starts and ends, so it can hold the save until the URL is in.
export function AvatarUpload({
  onUploaded,
  onBusyChange,
}: {
  onUploaded: (url: string) => void
  onBusyChange: (busy: boolean) => void
}) {
  const { authFetch } = useAuth()
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File) => {
    setError(null)
    setProgress(0)
    onBusyChange(true)
    try {
      onUploaded(await uploadPhoto(await preparePhoto(file), "avatar", authFetch, { onProgress: setProgress }))
    } catch (err) {
      setError(err instanceof Error ? err.message : UPLOAD_FAILED)
    } finally {
      setProgress(null)
      onBusyChange(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) upload(file)
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="max-md:h-11"
        disabled={progress !== null}
        onClick={() => input.current?.click()}
      >
        {progress !== null ? `Uploading ${Math.round(progress)}%` : "Upload photo"}
      </Button>
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
    </div>
  )
}
