import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { handleRouteError } from "@/lib/http"
import { createVideoUpload } from "@/lib/mux"

// Gives the browser a one-time Mux address to upload one video to.
export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const origin = req.headers.get("origin") || new URL(req.url).origin
    return NextResponse.json(await createVideoUpload(auth.id, origin), { status: 201 })
  } catch (error) {
    return handleRouteError(error, "Video upload error", "Failed to start the upload")
  }
}
