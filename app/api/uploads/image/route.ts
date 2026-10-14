import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { issuePhotoUpload } from "@/lib/blob"
import { handleRouteError, jsonError, readJson } from "@/lib/http"
import { MAX_PHOTO_BYTES, isPhotoPurpose, isPhotoType } from "@/lib/media-rules"

// Gives the browser a short-lived pass to upload one photo straight to Blob.
export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const body = await readJson(req)
    if (!body) return jsonError("Invalid request body", 400)

    const { purpose, contentType, size } = body
    if (!isPhotoPurpose(purpose)) return jsonError('Purpose must be "post" or "avatar"', 400)
    if (typeof contentType !== "string" || !isPhotoType(contentType)) {
      return jsonError("Photos must be JPEG, PNG, WebP or GIF", 400)
    }
    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
      return jsonError("Size must be a positive number of bytes", 400)
    }
    if (size > MAX_PHOTO_BYTES) return jsonError("Photos must be 10 MB or smaller", 400)

    return NextResponse.json(await issuePhotoUpload(purpose, auth.id, contentType))
  } catch (error) {
    return handleRouteError(error, "Photo upload error", "Failed to start the upload")
  }
}
