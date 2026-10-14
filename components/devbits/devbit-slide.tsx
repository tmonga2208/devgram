"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { Heart, MessageCircle, MoreHorizontal, Play, Share2 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DevBitVideo } from "@/components/devbits/devbit-video"
import { cn } from "@/lib/utils"
import type { PostType } from "@/lib/types"

interface DevBitSlideProps {
  devbit: PostType
  // On screen: it plays.
  active: boolean
  // Next in line: it loads its video's metadata ahead of time.
  next: boolean
  muted: boolean
  // The signed-in viewer's username, or null.
  viewer: string | null
  // Whether the viewer follows the author, once known.
  followsAuthor: boolean | undefined
  onLike: () => void
  onFollow: () => void
  onComments: () => void
  onShare: () => void
  onDelete: () => void
}

// Vertical clips fill the screen; landscape ones are shown whole.
function isVertical(aspectRatio?: string) {
  const match = aspectRatio?.match(/^(\d+):(\d+)$/)
  return match ? Number(match[2]) > Number(match[1]) : true
}

function ActionButton({
  label,
  pressed,
  count,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  count?: number
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 text-xs font-medium drop-shadow"
    >
      {children}
      {count !== undefined && <span>{count}</span>}
    </button>
  )
}

// One DevBit: its video, a tap to pause, who posted it with the caption, and
// like, comments, share and (on your own) delete.
export function DevBitSlide({
  devbit,
  active,
  next,
  muted,
  viewer,
  followsAuthor,
  onLike,
  onFollow,
  onComments,
  onShare,
  onDelete,
}: DevBitSlideProps) {
  const [pausedByTap, setPausedByTap] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [failed, setFailed] = useState(false)
  const [captionOpen, setCaptionOpen] = useState(false)

  // Leaving the screen forgets a tap-pause, so it plays again on return.
  useEffect(() => {
    if (!active) setPausedByTap(false)
  }, [active])

  const onBlocked = useCallback(() => setBlocked(true), [])
  const onError = useCallback(() => setFailed(true), [])

  const video = devbit.muxVideo
  if (!video) return null

  const own = viewer === devbit.author.username
  const liked = viewer !== null && (devbit.likedBy || []).includes(viewer)
  // Signed out, Follow leads to the login page; signed in, it shows once the
  // viewer is known not to follow the author.
  const showFollow = !own && (viewer === null || followsAuthor === false)

  return (
    <section
      data-devbit={devbit._id}
      data-author={devbit.author.username}
      className="relative flex h-full items-center justify-center"
    >
      <div className="relative h-full w-full md:aspect-[9/16] md:w-auto md:max-w-full">
        <DevBitVideo
          playbackId={video.playbackId}
          playing={active && !pausedByTap && !blocked && !failed}
          muted={muted}
          preload={active ? "auto" : next ? "metadata" : "none"}
          fill={isVertical(video.aspectRatio)}
          onBlocked={onBlocked}
          onError={onError}
        />
        <button
          type="button"
          data-devbit-video
          aria-label={pausedByTap ? "Play" : "Pause"}
          onClick={() => setPausedByTap((paused) => !paused)}
          className="absolute inset-0"
        />
        {blocked && !failed && (
          <button
            type="button"
            aria-label="Play"
            onClick={() => setBlocked(false)}
            className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <Play className="h-8 w-8 fill-white" />
          </button>
        )}
        {failed && (
          <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-white/80">
            Couldn&apos;t play this one
          </p>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pr-20 text-white">
          <div className="flex min-w-0 items-center gap-2">
            <Link href={`/profile/${devbit.author.username}`} className="pointer-events-auto flex min-w-0 items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={devbit.author.avatar} alt={devbit.author.username} />
                <AvatarFallback>{devbit.author.username[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="truncate font-medium">{devbit.author.username}</span>
            </Link>
            {showFollow && (
              <button
                type="button"
                data-follow
                onClick={onFollow}
                className="pointer-events-auto shrink-0 rounded-md border border-white/80 px-3 py-1 text-sm font-medium"
              >
                Follow
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCaptionOpen((open) => !open)}
            className={cn("pointer-events-auto mt-2 block text-left text-sm whitespace-pre-wrap wrap-anywhere", !captionOpen && "line-clamp-2")}
          >
            {devbit.caption}
          </button>
        </div>

        <div className="absolute bottom-24 right-2 flex flex-col items-center gap-4 text-white">
          <ActionButton label={liked ? "Unlike" : "Like"} pressed={liked} count={devbit.likes || 0} onClick={onLike}>
            <Heart className={cn("h-7 w-7", liked && "fill-red-500 text-red-500")} />
          </ActionButton>
          <ActionButton label="Comments" count={(devbit.comments || []).length} onClick={onComments}>
            <MessageCircle className="h-7 w-7" />
          </ActionButton>
          <ActionButton label="Share" onClick={onShare}>
            <Share2 className="h-7 w-7" />
          </ActionButton>
          {own && (
            <ActionButton label="More" onClick={onDelete}>
              <MoreHorizontal className="h-7 w-7" />
            </ActionButton>
          )}
        </div>
      </div>
    </section>
  )
}
