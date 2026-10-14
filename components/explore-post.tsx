import Link from "next/link"
import { Heart, MessageCircle, Code, Video } from "lucide-react"
import type { PostType } from "@/lib/types"

interface ExplorePostProps {
  post: PostType
}

export function ExplorePost({ post }: ExplorePostProps) {
  return (
    <Link href={`/p/${post._id}`} className="group relative aspect-[3/4] overflow-hidden bg-muted">
      {post.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, any host
        <img
          src={post.image}
          alt="Post thumbnail"
          loading="lazy"
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-50">
          {post.video ? <Video className="h-8 w-8" /> : <Code className="h-8 w-8" />}
        </div>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="mb-2 text-white font-medium">{post.author.username}</span>
        <div className="flex items-center gap-4 text-white">
          <div className="flex items-center gap-1">
            <Heart className="h-5 w-5 fill-white" />
            <span className="text-sm font-medium">{post.likes || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageCircle className="h-5 w-5 fill-white" />
            <span className="text-sm font-medium">{(post.comments || []).length}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
