import { del } from "@vercel/blob"
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client"
import { MAX_PHOTO_BYTES, ownPhotoUrl, photoPath, type PhotoPurpose } from "@/lib/media-rules"

const TOKEN_LIFETIME_MS = 10 * 60 * 1000
// A delete still running after this is given up on, so a slow or unreachable
// Blob can't hold up the request that made the photo unused.
const DELETE_TIMEOUT_MS = 5000

// A token that lets the browser upload one photo of this type, at most 10 MB,
// to one new path in the user's folder, during the next 10 minutes. The
// store's own read-write token never leaves the server.
export async function issuePhotoUpload(purpose: PhotoPurpose, userId: string, contentType: string) {
  const pathname = photoPath(purpose, userId, contentType, crypto.randomUUID())
  const token = await generateClientTokenFromReadWriteToken({
    pathname,
    allowedContentTypes: [contentType],
    maximumSizeInBytes: MAX_PHOTO_BYTES,
    validUntil: Date.now() + TOKEN_LIFETIME_MS,
    addRandomSuffix: false,
  })
  return { pathname, token }
}

// Deletes a photo the user uploaded for that purpose and leaves anything else
// alone: links to other sites and other people's uploads. A failure or a
// timeout is logged, because the change that made the photo unused is
// already saved.
export async function deleteOwnPhoto(url: unknown, purpose: PhotoPurpose, userId: string) {
  const own = ownPhotoUrl(url, purpose, userId)
  if (!own) return
  // Aborted with an AbortController, not AbortSignal.timeout: the SDK stops
  // at once on an AbortError but retries a TimeoutError with growing delays.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DELETE_TIMEOUT_MS)
  try {
    await del(own, { abortSignal: controller.signal })
  } catch (error) {
    console.error("Could not delete photo", own, error)
  } finally {
    clearTimeout(timer)
  }
}
