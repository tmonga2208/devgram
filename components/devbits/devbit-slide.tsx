"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Play } from "lucide-react"
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
}

// Vertical clips fill the screen; landscape ones are shown whole.
function isVertical(aspectRatio?: string) {
  const match = aspectRatio?.match(/^(\d+):(\d+)$/)
  return match ? Number(match[2]) > Number(match[1]) : true
}

// One DevBit: its video, a tap to pause, and who posted it with the caption.
export function DevBitSlide({ devbit, active, next, muted }: DevBitSlideProps) {
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
          <Link href={`/profile/${devbit.author.username}`} className="pointer-events-auto flex min-w-0 items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={devbit.author.avatar} alt={devbit.author.username} />
              <AvatarFallback>{devbit.author.username[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="truncate font-medium">{devbit.author.username}</span>
          </Link>
          <button
            type="button"
            onClick={() => setCaptionOpen((open) => !open)}
            className={cn("pointer-events-auto mt-2 block text-left text-sm whitespace-pre-wrap wrap-anywhere", !captionOpen && "line-clamp-2")}
          >
            {devbit.caption}
          </button>
        </div>
      </div>
    </section>
  )
}
