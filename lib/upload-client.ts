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
