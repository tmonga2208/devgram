import { NextResponse } from "next/server"
import mongoose from "mongoose"

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

// Returns the parsed body when it is a JSON object, otherwise null.
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json()
    return body && typeof body === "object" && !Array.isArray(body) ? body : null
  } catch {
    return null
  }
}

export function isValidId(id: string) {
  return /^[a-f\d]{24}$/i.test(id)
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export function handleRouteError(error: unknown, label: string, fallback: string) {
  if (error instanceof mongoose.Error.ValidationError) {
    const first = Object.values(error.errors)[0]
    return jsonError(first?.message || "Invalid input", 400)
  }
  if (typeof error === "object" && error !== null && (error as { code?: number }).code === 11000) {
    return jsonError("That value is already taken", 409)
  }
  console.error(`${label}:`, error)
  return jsonError(fallback, 500)
}
