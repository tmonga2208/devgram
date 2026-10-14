"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { muxThumbnailUrl } from "@/lib/media-urls"
import type { PostType } from "@/lib/types"

type Status = "loading" | "ready" | "error"

// A profile's DevBits tab: tall thumbnails, newest first. Each opens the
// DevBits screen at that DevBit, swiping through this person's DevBits.
export function ProfileDevBits({ username }: { username: string }) {
  const { authFetch, loading: authLoading } = useAuth()
  const [devbits, setDevbits] = useState<PostType[]>([])
  const [status, setStatus] = useState<Status>("loading")
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    setStatus("loading")
    authFetch(`/api/devbits?user=${encodeURIComponent(username)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load DevBits")
        const list = (await response.json()) as PostType[]
        if (cancelled) return
        setDevbits(list)
        setStatus("ready")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [username, authFetch, authLoading, attempt])

  if (status === "loading") {
    return (
      <div className="grid grid-cols-3 gap-1 md:gap-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="aspect-[9/16] animate-pulse bg-muted" />
        ))}
      </div>
    )
  }
  if (status === "error") {
    return (
      <div className="py-10 text-center">
        <p className="text-muted-foreground">Couldn&apos;t load DevBits</p>
        <Button variant="outline" className="mt-4" onClick={() => setAttempt((count) => count + 1)}>
          Try again
        </Button>
      </div>
    )
  }
  if (devbits.length === 0) return <p className="py-10 text-center text-muted-foreground">No DevBits yet.</p>

  return (
    <div className="grid grid-cols-3 gap-1 md:gap-4">
      {devbits.map(
        (devbit) =>
          devbit.muxVideo && (
            <Link
              key={devbit._id}
              href={`/devbits/${devbit._id}?user=${encodeURIComponent(username)}`}
              className="relative aspect-[9/16] overflow-hidden bg-black"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Mux thumbnail */}
              <img
                src={muxThumbnailUrl(devbit.muxVideo.playbackId, 360)}
                alt={devbit.caption}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              <Play className="absolute right-2 top-2 h-5 w-5 fill-white text-white drop-shadow" />
            </Link>
          ),
      )}
    </div>
  )
}
