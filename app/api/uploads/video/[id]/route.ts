import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { handleRouteError, jsonError } from "@/lib/http"
import { videoAssetProblem } from "@/lib/media-rules"
import { deleteVideoAsset, findVideoUpload, publicPlaybackId } from "@/lib/mux"

type Context = { params: Promise<{ id: string }> }

// How far the caller's video upload has got. Someone else's upload is 404.
export async function GET(req: Request, { params }: Context) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const upload = await findVideoUpload(id, auth.id)
    if (!upload) return jsonError("Video upload not found", 404)

    // A finished video that can never be posted (no picture, too long, failed
    // at Mux) is removed now: nobody can use it, and Mux's plan limits how
    // many videos it keeps.
    if (upload.asset && upload.asset.status !== "preparing") {
      const problem = videoAssetProblem(upload.asset, auth.id)
      if (problem) {
        await deleteVideoAsset(upload.asset.id)
        return NextResponse.json({ status: "failed", error: problem.message })
      }
    }
    if (upload.status !== "ready" || !upload.asset) return NextResponse.json({ status: upload.status })

    return NextResponse.json({
      status: "ready",
      playbackId: publicPlaybackId(upload.asset),
      aspectRatio: upload.asset.aspect_ratio,
      duration: upload.asset.duration,
    })
  } catch (error) {
    return handleRouteError(error, "Video status error", "Failed to read the upload")
  }
}
