import Mux, { NotFoundError } from "@mux/mux-node"
import { hasVideoTrack } from "@/lib/media-rules"

type MuxAsset = Awaited<ReturnType<Mux["video"]["assets"]["retrieve"]>>

let client: Mux | null = null

// Created on first use, so builds and requests that never touch video do not
// need the Mux credentials. It reads MUX_TOKEN_ID and MUX_TOKEN_SECRET.
function mux() {
  client ??= new Mux()
  return client
}

// Mux upload ids are letters and digits; anything else is not one of ours.
export function isUploadId(id: string) {
  return /^[A-Za-z0-9]{10,100}$/.test(id)
}

// A one-time address the browser uploads one video to, tagged with the
// user's id. With MUX_TEST_UPLOADS=1 (local development) Mux makes free test
// videos: watermarked, cut to 10 seconds and deleted after a day.
export async function createVideoUpload(userId: string, origin: string) {
  const upload = await mux().video.uploads.create({
    cors_origin: origin,
    timeout: 3600,
    test: process.env.MUX_TEST_UPLOADS === "1",
    new_asset_settings: {
      playback_policies: ["public"],
      video_quality: "basic",
      passthrough: userId,
    },
  })
  if (!upload.url) throw new Error("Mux returned an upload without an address")
  return { uploadId: upload.id, url: upload.url }
}

export interface VideoUpload {
  status: "uploading" | "processing" | "ready" | "failed"
  asset?: MuxAsset
}

// Where the user's upload stands, or null when there is no such upload or it
// belongs to someone else.
export async function findVideoUpload(uploadId: string, userId: string): Promise<VideoUpload | null> {
  if (!isUploadId(uploadId)) return null
  let upload
  try {
    upload = await mux().video.uploads.retrieve(uploadId)
  } catch (error) {
    if (error instanceof NotFoundError) return null
    throw error
  }
  if (upload.new_asset_settings?.passthrough !== userId) return null
  if (upload.status === "waiting") return { status: "uploading" }
  if (upload.status !== "asset_created" || !upload.asset_id) return { status: "failed" }

  const asset = await mux().video.assets.retrieve(upload.asset_id)
  if (asset.status === "errored") return { status: "failed", asset }
  if (asset.status !== "ready") return { status: "processing", asset }
  return { status: hasVideoTrack(asset) ? "ready" : "failed", asset }
}

export function publicPlaybackId(asset: MuxAsset) {
  return asset.playback_ids?.find((playback) => playback.policy === "public")?.id
}

// Removes a video from Mux. One that is already gone counts as removed; other
// failures are logged, since the post that used it is already deleted. One
// attempt of at most 5 seconds, so a slow or unreachable Mux can't hold up
// the request (the SDK would otherwise wait a minute, three times over).
export async function deleteVideoAsset(assetId: string) {
  try {
    await mux().video.assets.delete(assetId, { timeout: 5000, maxRetries: 0 })
  } catch (error) {
    if (!(error instanceof NotFoundError)) console.error("Could not delete video", assetId, error)
  }
}
