import type { IUser } from "@/models/User"

export const NOTIFICATION_DEFAULTS = {
  email: true,
  push: true,
  followers: true,
  comments: true,
  likes: true,
  mentions: true,
  marketing: false,
}

export const PRIVACY_DEFAULTS = {
  isPrivate: false,
  showActivityStatus: true,
  allowTagging: true,
  allowMessaging: true,
  showPosts: true,
  showStories: true,
}

export type NotificationKey = keyof typeof NOTIFICATION_DEFAULTS
export type PrivacyKey = keyof typeof PRIVACY_DEFAULTS

function pick<K extends string>(defaults: Record<K, boolean>, stored: Partial<Record<K, boolean>> | undefined) {
  const result = { ...defaults }
  for (const key of Object.keys(defaults) as K[]) {
    if (typeof stored?.[key] === "boolean") result[key] = stored[key] as boolean
  }
  return result
}

// The signed-in user's own view of their account. Never includes the password.
export function toPrivateUser(user: IUser) {
  return {
    id: String(user._id),
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    avatar: user.avatar || "/placeholder.svg",
    bio: user.bio || "",
    website: user.website || "",
    notificationSettings: pick(NOTIFICATION_DEFAULTS, user.notificationSettings),
    privacySettings: pick(PRIVACY_DEFAULTS, user.privacySettings),
  }
}
