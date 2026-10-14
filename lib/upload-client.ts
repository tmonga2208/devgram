import { put } from "@vercel/blob/client"
import type { PhotoPurpose } from "@/lib/media-rules"

export type AuthFetch = (input: string, init?: RequestInit) => Promise<Response>

export const UPLOAD_FAILED = "Upload failed. Try again."

export async function errorFrom(response: Response) {
  const data = await response.json().catch(() => null)
  return typeof data?.error === "string" ? data.error : UPLOAD_FAILED
}

interface UploadOptions {
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

// Uploads a prepared photo (see preparePhoto) straight to Blob and resolves
// to its public URL.
export async function uploadPhoto(
  photo: File,
  purpose: PhotoPurpose,
  authFetch: AuthFetch,
  { onProgress, signal }: UploadOptions = {},
) {
  const response = await authFetch("/api/uploads/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose, contentType: photo.type, size: photo.size }),
    signal,
  })
  if (!response.ok) throw new Error(await errorFrom(response))
  const { pathname, token } = (await response.json()) as { pathname: string; token: string }

  try {
    const blob = await put(pathname, photo, {
      access: "public",
      token,
      contentType: photo.type,
      abortSignal: signal,
      onUploadProgress: ({ percentage }) => onProgress?.(percentage),
    })
    return blob.url
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error(UPLOAD_FAILED)
  }
}

export interface VideoStatus {
  status: "uploading" | "processing" | "ready" | "failed"
  playbackId?: string
  aspectRatio?: string
  duration?: number
}

// Asks the app for a one-time Mux address to upload a video to.
export async function requestVideoUpload(authFetch: AuthFetch, signal?: AbortSignal) {
  const response = await authFetch("/api/uploads/video", { method: "POST", signal })
  if (!response.ok) throw new Error(await errorFrom(response))
  return (await response.json()) as { uploadId: string; url: string }
}

export async function getVideoStatus(uploadId: string, authFetch: AuthFetch, signal?: AbortSignal) {
  const response = await authFetch(`/api/uploads/video/${uploadId}`, { signal })
  if (!response.ok) throw new Error(await errorFrom(response))
  return (await response.json()) as VideoStatus
}

// The video's length in seconds, or null when this browser cannot read it.
// Some phone formats only Mux can read; the server checks the length again.
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    const url = URL.createObjectURL(file)
    const done = (seconds: number | null) => {
      URL.revokeObjectURL(url)
      resolve(seconds)
    }
    video.preload = "metadata"
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null)
    video.onerror = () => done(null)
    video.src = url
  })
}
