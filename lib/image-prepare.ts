import { MAX_PHOTO_BYTES, isPhotoType, photoTargetSize } from "@/lib/media-rules"

export class PhotoError extends Error {}

export const UNSUPPORTED_PHOTO = "This photo format isn't supported here. Choose a JPEG, PNG, WebP or GIF."

// Returns the file to upload: the original, or a JPEG redrawn on white at
// most 2048px on its longer side. Throws PhotoError with a message for the
// person when the file cannot be used.
export async function preparePhoto(file: File): Promise<File> {
  if (!isPhotoType(file.type)) throw new PhotoError(UNSUPPORTED_PHOTO)

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new PhotoError(UNSUPPORTED_PHOTO)
  }

  const target = photoTargetSize(bitmap.width, bitmap.height, file.size, file.type)
  if (!target) {
    bitmap.close()
    if (file.size > MAX_PHOTO_BYTES) throw new PhotoError("Photos must be 10 MB or smaller.")
    return file
  }

  const canvas = document.createElement("canvas")
  canvas.width = target.width
  canvas.height = target.height
  const context = canvas.getContext("2d")
  if (!context) throw new PhotoError(UNSUPPORTED_PHOTO)
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, target.width, target.height)
  context.drawImage(bitmap, 0, 0, target.width, target.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9))
  if (!blob) throw new PhotoError(UNSUPPORTED_PHOTO)
  if (blob.size > MAX_PHOTO_BYTES) throw new PhotoError("Photos must be 10 MB or smaller.")
  return new File([blob], `${file.name.replace(/\.[^.]*$/, "")}.jpg`, { type: "image/jpeg" })
}
