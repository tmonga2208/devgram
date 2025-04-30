import Link from "next/link"
import Image from "next/image"
import { Heart, MessageCircle, Code } from "lucide-react"
import type { PostType } from "@/lib/types"

interface ExplorePostProps {
  post: PostType
}

export function ExplorePost({ post }: ExplorePostProps) {
  return (
    <Link href={`/p/${post._id}`} className="group relative aspect-square overflow-hidden bg-muted">
      {post.image ? (
        <Image
          src={post.image || "/placeholder.svg"}
          alt="Post thumbnail"
          fill
          className="object-cover transition-transform group-hover:scale-105"
        />
      ) : post.code ? (
        <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-50">
          <Code className="h-8 w-8" />
        </div>
      ) : null}
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="flex items-center gap-4 text-white">
          <div className="flex items-center gap-1">
            <Heart className="h-5 w-5 fill-white" />
            <span className="text-sm font-medium">{post.likes}</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageCircle className="h-5 w-5 fill-white" />
            <span className="text-sm font-medium">{post.comments.length}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
