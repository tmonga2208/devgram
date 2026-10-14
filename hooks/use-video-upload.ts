"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { MAX_VIDEO_BYTES, VIDEO_LENGTH, type LengthLimit } from "@/lib/media-rules"
import { UPLOAD_FAILED, getVideoStatus, readVideoDuration, requestVideoUpload } from "@/lib/upload-client"

const POLL_MS = 2000
const PROCESSING_LIMIT_MS = 5 * 60 * 1000

export type VideoPhase = "uploading" | "processing" | "ready" | "failed"

export interface VideoUploadState {
  previewUrl: string
  phase: VideoPhase
  progress: number
  uploadId: string | null
  error: string | null
}

// Uploads a chosen video to Mux straight away, then waits until Mux has
// processed it. Choosing again, clearing or leaving the page cancels it.
// length is how long the video may be: 2 minutes for video posts, 90
// seconds for DevBits.
export function useVideoUpload(length: LengthLimit = VIDEO_LENGTH) {
  const { authFetch } = useAuth()
  const [video, setVideo] = useState<VideoUploadState | null>(null)
  const current = useRef<{ cancel: () => void; previewUrl: string } | null>(null)

  const clear = useCallback(() => {
    if (current.current) {
      current.current.cancel()
      URL.revokeObjectURL(current.current.previewUrl)
    }
    current.current = null
    setVideo(null)
  }, [])

  const select = useCallback(
    async (file: File) => {
      clear()
      const abort = new AbortController()
      let chunks: { abort: () => void } | null = null
      let timer: ReturnType<typeof setTimeout> | undefined
      const attempt = {
        previewUrl: URL.createObjectURL(file),
        cancel: () => {
          abort.abort()
          chunks?.abort()
          clearTimeout(timer)
        },
      }
      current.current = attempt
      const update = (change: Partial<VideoUploadState>) => {
        if (current.current === attempt) setVideo((state) => (state ? { ...state, ...change } : state))
      }
      const fail = (error: string) => update({ phase: "failed", error })
      setVideo({ previewUrl: attempt.previewUrl, phase: "uploading", progress: 0, uploadId: null, error: null })

      if (!file.type.startsWith("video/")) return fail("Choose a video file.")
      if (file.size > MAX_VIDEO_BYTES) return fail("Videos must be 200 MB or smaller.")
      const seconds = await readVideoDuration(file)
      if (current.current !== attempt) return
      if (seconds !== null && seconds > length.seconds) return fail(`${length.message}.`)

      try {
        const { uploadId, url } = await requestVideoUpload(authFetch, abort.signal)
        update({ uploadId })
        const { createUpload } = await import("@mux/upchunk")
        if (current.current !== attempt) return
        const upload = createUpload({ endpoint: url, file, chunkSize: 5120 })
        chunks = upload
        upload.on("progress", (event) => update({ progress: Number(event.detail) }))
        upload.on("error", () => fail(UPLOAD_FAILED))
        upload.on("success", () => {
          update({ phase: "processing", progress: 100 })
          const started = Date.now()
          const poll = async () => {
            if (current.current !== attempt) return
            try {
              const { status, error } = await getVideoStatus(uploadId, authFetch, abort.signal)
              if (status === "ready") return update({ phase: "ready" })
              if (status === "failed") return fail(error || "This video couldn't be processed. Try another file.")
            } catch {
              if (abort.signal.aborted) return
            }
            if (Date.now() - started > PROCESSING_LIMIT_MS) return fail("Processing is taking too long. Try again later.")
            timer = setTimeout(poll, POLL_MS)
          }
          poll()
        })
      } catch {
        if (!abort.signal.aborted) fail(UPLOAD_FAILED)
      }
    },
    [authFetch, clear, length],
  )

  useEffect(() => clear, [clear])

  return { video, select, clear }
}
