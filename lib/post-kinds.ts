// The two kinds of post. A DevBit is a short video with its own feed
// (/devbits); every other list shows regular posts only. It imports nothing,
// so the unit tests load it in Node.

export const POST_KINDS = ["post", "devbit"] as const
export type PostKind = (typeof POST_KINDS)[number]

// The most DevBits one feed request returns.
export const DEVBITS_PAGE = 200

export function isPostKind(value: unknown): value is PostKind {
  return POST_KINDS.includes(value as PostKind)
}

// Adds "not a DevBit" to a Mongo filter. Posts stored before DevBits have no
// kind and count as regular posts, which $ne matches.
export function withoutDevBits<T extends object>(filter: T = {} as T): T & { kind: { $ne: "devbit" } } {
  return { ...filter, kind: { $ne: "devbit" } }
}

// A new array with the same items in a random order (Fisher-Yates).
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
