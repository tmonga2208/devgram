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
export const MAX_DEVBIT_SECONDS = 90
export const DEVBIT_TOO_LONG = "DevBits can be at most 90 seconds long"

// How long a video may be where it is posted, and what to say when it isn't.
export interface LengthLimit {
  seconds: number
  message: string
}
export const VIDEO_LENGTH: LengthLimit = { seconds: MAX_VIDEO_SECONDS, message: VIDEO_TOO_LONG }
export const DEVBIT_LENGTH: LengthLimit = { seconds: MAX_DEVBIT_SECONDS, message: DEVBIT_TOO_LONG }

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

// A file name photoPath makes: a UUID and one of the photo extensions.
const UPLOADED_NAME = new RegExp(
  `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${Object.values(EXTENSIONS).join("|")})$`,
)

// The plain URL of a photo this app uploaded to the user's folder for that
// purpose, or null for anything else. Only those files are deleted on the
// user's behalf, so neither a post that borrows someone else's uploaded photo
// nor a URL made to look like it is in the user's folder can delete another
// file.
export function ownPhotoUrl(url: unknown, purpose: PhotoPurpose, userId: string): string | null {
  if (typeof url !== "string") return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const folder = `/${photoFolder(purpose, userId)}`
  const owned =
    parsed.protocol === "https:" &&
    parsed.hostname.endsWith(".public.blob.vercel-storage.com") &&
    parsed.pathname.startsWith(folder) &&
    UPLOADED_NAME.test(parsed.pathname.slice(folder.length))
  return owned ? `${parsed.origin}${parsed.pathname}` : null
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
  tracks?: Array<{ type?: string }>
}

// Whether a ready asset has a picture. Mux turns some files that aren't
// videos, text among them, into assets with sound only.
export function hasVideoTrack(asset: MuxAssetSummary): boolean {
  return asset.tracks?.some((track) => track.type === "video") ?? false
}

// Why the Mux asset cannot be posted by this user, or null when it can. The
// length limit depends on what it is posted as: a video post or a DevBit.
export function videoAssetProblem(
  asset: MuxAssetSummary,
  userId: string,
  length: LengthLimit = VIDEO_LENGTH,
): { status: number; message: string } | null {
  if (asset.passthrough !== userId) return { status: 404, message: "Video upload not found" }
  if (asset.status === "errored") return { status: 400, message: "This video could not be processed" }
  if (asset.status !== "ready") return { status: 409, message: "This video is still processing" }
  if (!hasVideoTrack(asset)) return { status: 400, message: "This video could not be processed" }
  if ((asset.duration ?? 0) > length.seconds) return { status: 400, message: length.message }
  if (!asset.playback_ids?.some((playback) => playback.policy === "public")) {
    return { status: 400, message: "This video cannot be played" }
  }
  return null
}
