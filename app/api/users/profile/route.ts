import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import User from "@/models/User"
import Post from "@/models/Post"
import { requireAuth } from "@/lib/auth"
import { LIMITS, handleRouteError, isHttpUrl, jsonError, readJson } from "@/lib/http"
import { deleteOwnPhoto } from "@/lib/blob"
import {
  NOTIFICATION_DEFAULTS,
  PRIVACY_DEFAULTS,
  toPrivateUser,
  type NotificationKey,
  type PrivacyKey,
} from "@/lib/user-response"

// The signed-in user's own account, including settings.
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    await connectToDatabase()
    const user = await User.findOne({ username: auth.username })
    if (!user) return jsonError("Authentication required", 401)

    return NextResponse.json(toPrivateUser(user))
  } catch (error) {
    return handleRouteError(error, "Fetch profile error", "Failed to fetch profile")
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const data = await readJson(req)
    if (!data) return jsonError("Invalid request body", 400)

    await connectToDatabase()
    const user = await User.findOne({ username: auth.username })
    if (!user) return jsonError("Authentication required", 401)

    const previousAvatar = user.avatar

    if (data.username !== undefined && data.username !== user.username) {
      return jsonError("Username cannot be changed", 400)
    }

    if (data.fullName !== undefined) {
      if (typeof data.fullName !== "string" || !data.fullName.trim()) {
        return jsonError("Full name is required", 400)
      }
      if (data.fullName.trim().length > LIMITS.fullName) {
        return jsonError(`Full name must be ${LIMITS.fullName} characters or fewer`, 400)
      }
      user.fullName = data.fullName.trim()
    }

    if (data.bio !== undefined) {
      if (typeof data.bio !== "string") return jsonError("Bio must be text", 400)
      if (data.bio.length > LIMITS.bio) return jsonError(`Bio must be ${LIMITS.bio} characters or fewer`, 400)
      user.bio = data.bio
    }

    if (data.website !== undefined) {
      if (typeof data.website !== "string") return jsonError("Website must be text", 400)
      const website = data.website.trim()
      if (website.length > LIMITS.url) return jsonError("Website URL is too long", 400)
      if (website && !isHttpUrl(website)) return jsonError("Website must be an http(s) URL", 400)
      user.website = website
    }

    if (data.avatar !== undefined) {
      if (typeof data.avatar !== "string") return jsonError("Avatar must be text", 400)
      const avatar = data.avatar.trim()
      if (avatar.length > LIMITS.url) return jsonError("Avatar URL is too long", 400)
      if (avatar && avatar !== "/placeholder.svg" && !isHttpUrl(avatar)) {
        return jsonError("Avatar must be an http(s) URL", 400)
      }
      user.avatar = avatar || "/placeholder.svg"
    }

    if (data.email !== undefined) {
      if (typeof data.email !== "string") return jsonError("Email must be text", 400)
      const email = data.email.trim().toLowerCase()
      if (email.length > LIMITS.email) return jsonError(`Email must be ${LIMITS.email} characters or fewer`, 400)
      if (!/^\S+@\S+\.\S+$/.test(email)) return jsonError("Please enter a valid email address", 400)
      if (email !== user.email) {
        if (await User.exists({ email })) return jsonError("Email is already taken", 409)
        user.email = email
      }
    }

    if (data.newPassword !== undefined && data.newPassword !== "") {
      if (typeof data.newPassword !== "string" || typeof data.currentPassword !== "string" || !data.currentPassword) {
        return jsonError("Current password is required", 400)
      }
      if (!(await user.comparePassword(data.currentPassword))) {
        return jsonError("Current password is incorrect", 400)
      }
      if (data.newPassword.length < 6) {
        return jsonError("Password must be at least 6 characters long", 400)
      }
      if (data.newPassword.length > LIMITS.password) {
        return jsonError(`Password must be ${LIMITS.password} characters or fewer`, 400)
      }
      // The pre-save hook on the User model hashes this.
      user.password = data.newPassword
    }

    if (data.notificationSettings && typeof data.notificationSettings === "object") {
      const incoming = data.notificationSettings as Record<string, unknown>
      for (const key of Object.keys(NOTIFICATION_DEFAULTS) as NotificationKey[]) {
        if (typeof incoming[key] === "boolean") user.notificationSettings[key] = incoming[key] as boolean
      }
    }

    if (data.privacySettings && typeof data.privacySettings === "object") {
      const incoming = data.privacySettings as Record<string, unknown>
      for (const key of Object.keys(PRIVACY_DEFAULTS) as PrivacyKey[]) {
        if (typeof incoming[key] === "boolean") user.privacySettings[key] = incoming[key] as boolean
      }
    }

    await user.save()

    // Posts and comments carry their own copy of the author's avatar.
    if (user.avatar !== previousAvatar) {
      await Promise.all([
        Post.updateMany(
          { "author.username": user.username },
          { $set: { "author.avatar": user.avatar } },
          { timestamps: false }
        ),
        Post.updateMany(
          { "comments.username": user.username },
          { $set: { "comments.$[own].avatar": user.avatar } },
          { arrayFilters: [{ "own.username": user.username }], timestamps: false }
        ),
      ])
      // The replaced picture is no longer used anywhere.
      await deleteOwnPhoto(previousAvatar, "avatar", auth.id)
    }

    return NextResponse.json(toPrivateUser(user))
  } catch (error) {
    return handleRouteError(error, "Update profile error", "Failed to update profile")
  }
}
