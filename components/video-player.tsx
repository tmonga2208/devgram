"use client"

import { useState, useEffect } from "react"

interface VideoPlayerProps {
  url: string
  className?: string
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  playsInline?: boolean
}

export function VideoPlayer({ 
  url, 
  className = "",
  autoPlay = false,
  muted = false,
  loop = false,
  playsInline = false
}: VideoPlayerProps) {
  const [videoType, setVideoType] = useState<"youtube" | "vimeo" | "direct" | null>(null)
  const [videoId, setVideoId] = useState<string | null>(null)

  useEffect(() => {
    // YouTube URL patterns
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    const youtubeMatch = url.match(youtubeRegex)

    // Vimeo URL patterns
    const vimeoRegex = /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/
    const vimeoMatch = url.match(vimeoRegex)

    if (youtubeMatch) {
      setVideoType("youtube")
      setVideoId(youtubeMatch[1])
    } else if (vimeoMatch) {
      setVideoType("vimeo")
      setVideoId(vimeoMatch[1])
    } else {
      setVideoType("direct")
      setVideoId(url)
    }
  }, [url])

  if (!videoType || !videoId) {
    return null
  }

  const renderVideo = () => {
    switch (videoType) {
      case "youtube":
        return (
          <iframe
            className="w-full aspect-video rounded-md"
            src={`https://www.youtube.com/embed/${videoId}?autoplay=${autoPlay ? 1 : 0}&mute=${muted ? 1 : 0}&loop=${loop ? 1 : 0}&playsinline=${playsInline ? 1 : 0}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )
      case "vimeo":
        return (
          <iframe
            className="w-full aspect-video rounded-md"
            src={`https://player.vimeo.com/video/${videoId}?autoplay=${autoPlay ? 1 : 0}&muted=${muted ? 1 : 0}&loop=${loop ? 1 : 0}&playsinline=${playsInline ? 1 : 0}`}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        )
      case "direct":
        return (
          <video
            className="w-full aspect-video rounded-md"
            controls
            src={videoId}
            autoPlay={autoPlay}
            muted={muted}
            loop={loop}
            playsInline={playsInline}
          >
            Your browser does not support the video tag.
          </video>
        )
      default:
        return null
    }
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {renderVideo()}
    </div>
  )
} 