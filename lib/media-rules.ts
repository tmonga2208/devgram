// Limits and rules for uploaded photos and videos, shared by the API routes
// and the browser. It imports nothing, so the unit tests load it in Node.

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024
// A photo larger than this on its longer side, or in bytes, is redrawn in
// the browser before upload.
export const PHOTO_MAX_SIDE = 2048
export const PHOTO_SHRINK_BYTES = 2 * 1024 * 1024
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024
export const MAX_VIDEO_SECONDS = 120
export const VIDEO_TOO_LONG = "Videos can be at most 2 minutes long"

export type PhotoPurpose = "post" | "avatar"

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

export function isPhotoType(type: string): boolean {
  return PHOTO_TYPES.includes(type)
}

export function isPhotoPurpose(value: unknown): value is PhotoPurpose {
  return value === "post" || value === "avatar"
}

// Each user's photos live in their own folder, one per purpose.
export function photoFolder(purpose: PhotoPurpose, userId: string): string {
  return `${purpose === "post" ? "posts" : "avatars"}/${userId}/`
}

export function photoPath(purpose: PhotoPurpose, userId: string, contentType: string, id: string): string {
  return `${photoFolder(purpose, userId)}${id}.${EXTENSIONS[contentType]}`
}

// Whether the URL is a Blob file in the user's folder for that purpose. Only
// those files are deleted on the user's behalf, so a post that borrows
// someone else's uploaded photo cannot be used to delete it.
export function ownsPhotoUrl(url: unknown, purpose: PhotoPurpose, userId: string): boolean {
  if (typeof url !== "string") return false
  try {
    const { protocol, hostname, pathname } = new URL(url)
    return (
      protocol === "https:" &&
      hostname.endsWith(".public.blob.vercel-storage.com") &&
      pathname.startsWith(`/${photoFolder(purpose, userId)}`) &&
      pathname.length > photoFolder(purpose, userId).length + 1
    )
  } catch {
    return false
  }
}

// The size to redraw a photo at before upload, or null to upload it as it is.
export function photoTargetSize(
  width: number,
  height: number,
  bytes: number,
  type: string,
): { width: number; height: number } | null {
  if (type === "image/gif") return null
  const longer = Math.max(width, height)
  if (longer <= PHOTO_MAX_SIDE && bytes <= PHOTO_SHRINK_BYTES) return null
  const scale = Math.min(1, PHOTO_MAX_SIDE / longer)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export interface MuxAssetSummary {
  status: string
  passthrough?: string
  duration?: number
  playback_ids?: Array<{ id: string; policy: string }>
}

// Why the Mux asset cannot go on this user's post, or null when it can.
export function videoAssetProblem(
  asset: MuxAssetSummary,
  userId: string,
): { status: number; message: string } | null {
  if (asset.passthrough !== userId) return { status: 404, message: "Video upload not found" }
  if (asset.status === "errored") return { status: 400, message: "This video could not be processed" }
  if (asset.status !== "ready") return { status: 409, message: "This video is still processing" }
  if ((asset.duration ?? 0) > MAX_VIDEO_SECONDS) return { status: 400, message: VIDEO_TOO_LONG }
  if (!asset.playback_ids?.some((playback) => playback.policy === "public")) {
    return { status: 400, message: "This video cannot be played" }
  }
  return null
}
