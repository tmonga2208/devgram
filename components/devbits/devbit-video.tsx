"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { muxThumbnailUrl } from "@/lib/media-urls"
import type { MuxVideoElement } from "@/types/mux-video"

interface DevBitVideoProps {
  playbackId: string
  // Plays while true, pauses otherwise.
  playing: boolean
  muted: boolean
  preload: "none" | "metadata" | "auto"
  // Vertical clips fill the screen; landscape ones show whole.
  fill: boolean
  // The browser refused to start it without a tap.
  onBlocked: () => void
  onError: () => void
}

// One DevBit's video: Mux's bare <mux-video> element, played, paused and
// muted from outside. Its code loads with the DevBits screen only.
export function DevBitVideo({ playbackId, playing, muted, preload, fill, onBlocked, onError }: DevBitVideoProps) {
  const ref = useRef<MuxVideoElement>(null)
  const [defined, setDefined] = useState(false)

  // Defines <mux-video> the first time a DevBit is shown.
  useEffect(() => {
    let cancelled = false
    import("@mux/mux-video").then(() => {
      if (!cancelled) setDefined(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (defined && ref.current) ref.current.muted = muted
  }, [defined, muted])

  useEffect(() => {
    const video = ref.current
    if (!defined || !video) return
    if (!playing) {
      video.pause()
      return
    }
    video.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "NotAllowedError") onBlocked()
    })
  }, [defined, playing, onBlocked])

  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.addEventListener("error", onError)
    return () => video.removeEventListener("error", onError)
  }, [onError])

  return (
    <mux-video
      ref={ref}
      playback-id={playbackId}
      poster={muxThumbnailUrl(playbackId, 720)}
      preload={preload}
      muted
      loop
      playsinline
      style={{ width: "100%", height: "100%", "--media-object-fit": fill ? "cover" : "contain" } as CSSProperties}
    />
  )
}
