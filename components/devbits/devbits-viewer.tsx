"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Volume2, VolumeX } from "lucide-react"
import toast from "react-hot-toast"
import { DevBitComments } from "@/components/devbits/devbit-comments"
import { DevBitDeleteDialog } from "@/components/devbits/devbit-delete-dialog"
import { DevBitSlide } from "@/components/devbits/devbit-slide"
import { useAuth } from "@/contexts/auth-context"
import { RequestError, usePosts } from "@/contexts/posts-context"
import type { CommentType, PostType } from "@/lib/types"

interface DevBitsViewerProps {
  devbits: PostType[]
  // The DevBit to open at.
  startIndex: number
}

// The space between the top bar and the tab bar on phones; below the top bar
// and inside the page padding (7rem) on wider screens.
export const DEVBITS_HEIGHT =
  "h-[calc(100dvh-var(--top-bar-height)-var(--tab-bar-height))] md:h-[calc(100dvh-var(--top-bar-height)-7rem)]"

// A list that snaps one DevBit per screen. The DevBit at least 60% on screen
// plays and the rest wait. Sound starts off; the speaker button turns it on
// for the rest of the visit. Likes, follows, comments, sharing and deleting
// happen here, and a DevBit deleted meanwhile leaves the list.
export function DevBitsViewer({ devbits, startIndex }: DevBitsViewerProps) {
  const { user, authFetch } = useAuth()
  const { likePost, deletePost } = usePosts()
  const router = useRouter()
  const list = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState(devbits)
  const [active, setActive] = useState(startIndex)
  const [muted, setMuted] = useState(true)
  // Whether the viewer follows each author, once looked up.
  const [following, setFollowing] = useState<Record<string, boolean>>({})
  const [commentsFor, setCommentsFor] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => setItems(devbits), [devbits])

  // Opens at the linked DevBit.
  useEffect(() => {
    const root = list.current
    if (root) root.scrollTop = startIndex * root.clientHeight
  }, [startIndex])

  useEffect(() => {
    const root = list.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio >= 0.6) setActive(Number((entry.target as HTMLElement).dataset.index))
        }
      },
      { root, threshold: 0.6 },
    )
    for (const slide of root.querySelectorAll("[data-index]")) observer.observe(slide)
    return () => observer.disconnect()
  }, [items])

  // Looks up, once per author, whether the viewer follows whoever posted the
  // DevBit on screen.
  const author = items[active]?.author.username
  useEffect(() => {
    if (!user || !author || author === user.username || author in following) return
    let cancelled = false
    authFetch(`/api/users/${encodeURIComponent(author)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((profile: { isFollowing?: boolean } | null) => {
        if (!cancelled && profile) setFollowing((current) => ({ ...current, [author]: Boolean(profile.isFollowing) }))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [author, user, authFetch, following])

  const replace = (updated: PostType) =>
    setItems((current) => current.map((item) => (item._id === updated._id ? updated : item)))

  // A DevBit deleted somewhere else: say so and take it out of the list.
  const removed = useCallback((id: string) => {
    toast.error("This DevBit was removed")
    setItems((current) => current.filter((item) => item._id !== id))
  }, [])

  const requireUser = () => {
    if (user) return true
    router.push("/login")
    return false
  }

  const like = async (devbit: PostType) => {
    if (!requireUser()) return
    try {
      replace(await likePost(devbit._id))
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) removed(devbit._id)
      else toast.error(error instanceof Error ? error.message : "Failed to update like")
    }
  }

  const follow = async (username: string) => {
    if (!requireUser()) return
    try {
      const response = await authFetch(`/api/users/${encodeURIComponent(username)}/follow`, { method: "POST" })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "Failed to follow")
      setFollowing((current) => ({ ...current, [username]: Boolean(data?.following) }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to follow")
    }
  }

  const share = async (devbit: PostType) => {
    const url = `${window.location.origin}/devbits/${devbit._id}`
    if (typeof navigator.share === "function") {
      // Closing the share sheet rejects; there is nothing to report.
      await navigator.share({ url, title: devbit.caption }).catch(() => undefined)
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copied")
    } catch {
      toast.error("Couldn't copy the link")
    }
  }

  const remove = async (id: string) => {
    setDeleting(null)
    try {
      await deletePost(id)
      setItems((current) => current.filter((item) => item._id !== id))
      toast.success("DevBit deleted")
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) removed(id)
      else toast.error(error instanceof Error ? error.message : "Failed to delete")
    }
  }

  const commentAdded = (id: string, comment: CommentType) =>
    setItems((current) =>
      current.map((item) => (item._id === id ? { ...item, comments: [...(item.comments || []), comment] } : item)),
    )

  return (
    <div className={`relative overflow-hidden bg-black md:rounded-lg ${DEVBITS_HEIGHT}`}>
      <div ref={list} data-devbits-list className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain">
        {items.map((devbit, index) => (
          <div key={devbit._id} data-index={index} className="h-full snap-start snap-always">
            <DevBitSlide
              devbit={devbit}
              active={index === active}
              next={index === active + 1}
              near={Math.abs(index - active) <= 1}
              muted={muted}
              viewer={user?.username ?? null}
              followsAuthor={following[devbit.author.username]}
              onLike={() => like(devbit)}
              onFollow={() => follow(devbit.author.username)}
              onComments={() => setCommentsFor(devbit._id)}
              onShare={() => share(devbit)}
              onDelete={() => setDeleting(devbit._id)}
            />
          </div>
        ))}
      </div>
      <Link
        href="/create?tab=devbit"
        aria-label="Post a DevBit"
        className="absolute left-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white"
      >
        <Plus className="h-6 w-6" />
      </Link>
      <button
        type="button"
        onClick={() => setMuted((current) => !current)}
        aria-label={muted ? "Turn sound on" : "Turn sound off"}
        className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white"
      >
        {muted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
      </button>
      <DevBitComments
        devbit={items.find((item) => item._id === commentsFor) ?? null}
        onClose={() => setCommentsFor(null)}
        onAdded={commentAdded}
        onRemoved={(id) => {
          setCommentsFor(null)
          removed(id)
        }}
      />
      <DevBitDeleteDialog
        open={deleting !== null}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove(deleting)
        }}
      />
    </div>
  )
}
