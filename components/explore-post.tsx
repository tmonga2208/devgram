import Link from "next/link"
import Image from "next/image"
import { Heart, MessageCircle, Code, CheckCircle2 } from "lucide-react"
import type { PostType } from "@/lib/types"
import { VideoPlayer } from "./video-player"

interface ExplorePostProps {
  post: PostType
}

export function ExplorePost({ post }: ExplorePostProps) {
  // Ensure post has required properties with defaults
  const postData = {
    ...post,
    likes: post.likes || 0,
    comments: post.comments || [],
    liked: post.liked || false,
    author: {
      ...post.author,
      verified: post.author?.verified || false
    }
  }

  return (
    <Link href={`/p/${post._id}`} className="group relative aspect-[3/4] overflow-hidden bg-muted">
      {postData.image ? (
        <Image
          src={postData.image}
          alt="Post thumbnail"
          fill
          className="object-cover transition-transform group-hover:scale-105"
        />
      ) : postData.code ? (
        <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-50">
          <Code className="h-8 w-8" />
        </div>
      ) : postData.video ? (
        <VideoPlayer
          url={postData.video}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          autoPlay
          muted
          loop
          playsInline
        />
      ) : null}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-white font-medium">{postData.author.username}</span>
          {postData.author.verified && (
            <CheckCircle2 className="h-4 w-4 text-white fill-white" />
          )}
        </div>
        <div className="flex items-center gap-4 text-white">
          <div className="flex items-center gap-1">
            <Heart className="h-5 w-5 fill-white" />
            <span className="text-sm font-medium">{postData.likes}</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageCircle className="h-5 w-5 fill-white" />
            <span className="text-sm font-medium">{postData.comments.length}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
