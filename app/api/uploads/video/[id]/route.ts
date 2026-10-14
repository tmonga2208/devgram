import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { handleRouteError, jsonError } from "@/lib/http"
import { findVideoUpload, publicPlaybackId } from "@/lib/mux"

type Context = { params: Promise<{ id: string }> }

// How far the caller's video upload has got. Someone else's upload is 404.
export async function GET(req: Request, { params }: Context) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const upload = await findVideoUpload(id, auth.id)
    if (!upload) return jsonError("Video upload not found", 404)
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
