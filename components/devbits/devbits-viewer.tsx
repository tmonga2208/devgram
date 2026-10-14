"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Plus, Volume2, VolumeX } from "lucide-react"
import { DevBitSlide } from "@/components/devbits/devbit-slide"
import type { PostType } from "@/lib/types"

interface DevBitsViewerProps {
  devbits: PostType[]
  // The DevBit to open at.
  startIndex: number
}

// The space between the top bar and the tab bar on phones; below the top bar
// and inside the page padding on wider screens.
export const DEVBITS_HEIGHT = "h-[calc(100dvh-var(--top-bar-height)-var(--tab-bar-height))] md:h-[calc(100dvh-7rem)]"

// A list that snaps one DevBit per screen. The DevBit at least 60% on screen
// plays and the rest wait. Sound starts off; the speaker button turns it on
// for the rest of the visit.
export function DevBitsViewer({ devbits, startIndex }: DevBitsViewerProps) {
  const list = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(startIndex)
  const [muted, setMuted] = useState(true)

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
  }, [devbits])

  return (
    <div className={`relative overflow-hidden bg-black md:rounded-lg ${DEVBITS_HEIGHT}`}>
      <div ref={list} data-devbits-list className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain">
        {devbits.map((devbit, index) => (
          <div key={devbit._id} data-index={index} className="h-full snap-start snap-always">
            <DevBitSlide devbit={devbit} active={index === active} next={index === active + 1} muted={muted} />
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
    </div>
  )
}
