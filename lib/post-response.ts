import type { AuthUser } from "@/lib/auth"

interface PostLike {
  savedBy?: string[]
  toObject?: () => unknown
}

// What a caller may see of a post. Likes are public. Saves are private, so
// savedBy is cut down to the viewer's own entry, or to nothing.
export function toPublicPost(post: PostLike, viewer: AuthUser | null) {
  const plain = (typeof post.toObject === "function" ? post.toObject() : post) as Record<string, unknown>
  const savedBy = Array.isArray(plain.savedBy) ? (plain.savedBy as string[]) : []

  return {
    ...plain,
    savedBy: viewer && savedBy.includes(viewer.username) ? [viewer.username] : [],
  }
}
