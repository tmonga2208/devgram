"use client"

import MuxPlayer from "@mux/mux-player-react/lazy"

interface MuxVideoProps {
  playbackId: string
  // As Mux reports it, for example "9:16".
  aspectRatio?: string
  title?: string
}

function cssAspectRatio(ratio?: string) {
  const match = ratio?.match(/^(\d+):(\d+)$/)
  return match ? `${match[1]} / ${match[2]}` : "16 / 9"
}

// An uploaded video. The player's code loads only when a page shows one.
export function MuxVideo({ playbackId, aspectRatio, title }: MuxVideoProps) {
  return (
    <MuxPlayer
      playbackId={playbackId}
      streamType="on-demand"
      accentColor="#18181b"
      metadataVideoTitle={title}
      style={{ width: "100%", aspectRatio: cssAspectRatio(aspectRatio), maxHeight: "80dvh" }}
    />
  )
}
