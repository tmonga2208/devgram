import type { DetailedHTMLProps, HTMLAttributes } from "react"

// The parts of <mux-video> (from @mux/mux-video) the DevBits viewer uses. It
// behaves like a <video> that plays Mux streams.
export type MuxVideoElement = HTMLElement & Pick<HTMLMediaElement, "play" | "pause" | "paused" | "muted">

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "mux-video": DetailedHTMLProps<HTMLAttributes<MuxVideoElement>, MuxVideoElement> & {
        "playback-id": string
        poster?: string
        preload?: "none" | "metadata" | "auto"
        muted?: boolean
        loop?: boolean
        playsinline?: boolean
      }
    }
  }
}
