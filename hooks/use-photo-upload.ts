"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { preparePhoto } from "@/lib/image-prepare"
import type { PhotoPurpose } from "@/lib/media-rules"
import { UPLOAD_FAILED, uploadPhoto } from "@/lib/upload-client"

export interface PhotoUploadState {
  previewUrl: string | null
  progress: number
  // Set once the photo is stored.
  url: string | null
  error: string | null
}

// Prepares and uploads a chosen photo straight away, tracking its progress.
export function usePhotoUpload(purpose: PhotoPurpose) {
  const { authFetch } = useAuth()
  const [photo, setPhoto] = useState<PhotoUploadState | null>(null)
  const current = useRef<{ abort: AbortController; previewUrl: string | null } | null>(null)

  const clear = useCallback(() => {
    if (current.current) {
      current.current.abort.abort()
      if (current.current.previewUrl) URL.revokeObjectURL(current.current.previewUrl)
    }
    current.current = null
    setPhoto(null)
  }, [])

  const select = useCallback(
    async (file: File) => {
      clear()
      const attempt = { abort: new AbortController(), previewUrl: null as string | null }
      current.current = attempt
      const update = (change: Partial<PhotoUploadState>) => {
        if (current.current === attempt) setPhoto((state) => (state ? { ...state, ...change } : state))
      }
      setPhoto({ previewUrl: null, progress: 0, url: null, error: null })

      try {
        const prepared = await preparePhoto(file)
        attempt.previewUrl = URL.createObjectURL(prepared)
        update({ previewUrl: attempt.previewUrl })
        const url = await uploadPhoto(prepared, purpose, authFetch, {
          signal: attempt.abort.signal,
          onProgress: (progress) => update({ progress }),
        })
        update({ progress: 100, url })
      } catch (error) {
        if (attempt.abort.signal.aborted) return
        update({ error: error instanceof Error ? error.message : UPLOAD_FAILED })
      }
    },
    [authFetch, clear, purpose],
  )

  useEffect(() => clear, [clear])

  return { photo, select, clear }
}
