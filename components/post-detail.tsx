"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Heart, MessageCircle, Bookmark, Code, Send } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { CodeBlock } from "@/components/code-block"
import { VideoPlayer } from "./video-player"
import type { PostType } from "@/lib/types"
import { usePosts } from "@/contexts/posts-context"
import { useAuth } from "@/contexts/auth-context"
import { formatDistanceToNow } from "date-fns"
import toast from "react-hot-toast"

interface PostDetailProps {
  id: string
}

type Status = "loading" | "ready" | "missing" | "error"

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function PostDetail({ id }: PostDetailProps) {
  const { user, authFetch, loading: authLoading } = useAuth()
  const { likePost, savePost, addComment } = usePosts()
  const router = useRouter()
  const [post, setPost] = useState<PostType | null>(null)
  const [status, setStatus] = useState<Status>("loading")
  const [similarPosts, setSimilarPosts] = useState<PostType[]>([])
  const [comment, setComment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    // Wait for the stored session, so the response includes the viewer's own save.
    if (authLoading) return
    let cancelled = false

    const load = async () => {
      setStatus("loading")
      try {
        const response = await authFetch(`/api/posts/${id}`)
        if (cancelled) return
        if (response.status === 404) {
          setStatus("missing")
          return
        }
        if (!response.ok) {
          setStatus("error")
          return
        }
        const data = (await response.json()) as PostType
        if (cancelled) return
        setPost(data)
        setStatus("ready")

        const similar = await fetch(`/api/posts/similar/${id}`)
        if (!cancelled && similar.ok) setSimilarPosts(await similar.json())
      } catch {
        if (!cancelled) setStatus("error")
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id, authFetch, authLoading])

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-6xl md:p-4">
        <div className="aspect-video animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (status === "missing" || status === "error" || !post) {
    return (
      <div className="mx-auto max-w-6xl py-10 text-center">
        <p className="text-muted-foreground">
          {status === "missing" ? "This post does not exist or was deleted." : "Could not load this post."}
        </p>
        <Link href="/" className="mt-4 inline-block text-blue-500 hover:underline">
          Back to feed
        </Link>
      </div>
    )
  }

  const isLiked = !!user && (post.likedBy || []).includes(user.username)
  const isSaved = !!user && (post.savedBy || []).includes(user.username)
  const comments = post.comments || []

  const requireUser = () => {
    if (user) return true
    router.push("/login")
    return false
  }

  const handleLike = async () => {
    if (!requireUser()) return
    try {
      setPost(await likePost(post._id))
    } catch (error) {
      toast.error(messageOf(error, "Failed to update like"))
    }
  }

  const handleSave = async () => {
    if (!requireUser()) return
    try {
      setPost(await savePost(post._id))
    } catch (error) {
      toast.error(messageOf(error, "Failed to update save"))
    }
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim() || !user) return

    setIsSubmitting(true)
    try {
      const newComment = await addComment(post._id, comment)
      setPost((current) => (current ? { ...current, comments: [...(current.comments || []), newComment] } : current))
      setComment("")
    } catch (error) {
      toast.error(messageOf(error, "Failed to add comment"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto md:p-4">
      <div className="space-y-4">
        <div className="bg-card text-card-foreground rounded-lg shadow-md overflow-hidden">
          {post.image && (
            // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, any host
            <img src={post.image} alt={post.caption || "Post image"} className="w-full object-cover" />
          )}
          {post.video && <VideoPlayer url={post.video} className="w-full" />}
          {post.code && <CodeBlock code={post.code} language={post.language || "javascript"} />}

          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleLike}
                  className={`flex items-center gap-1 ${isLiked ? "text-red-500 hover:text-red-600" : "text-gray-500 hover:text-gray-600"}`}
                  aria-label={isLiked ? "Unlike post" : "Like post"}
                >
                  <Heart className={`h-6 w-6 ${isLiked ? "fill-current" : ""}`} />
                  <span>{post.likes}</span>
                </button>
                <span className="flex items-center gap-1 text-gray-500">
                  <MessageCircle className="h-6 w-6" />
                  <span>{comments.length}</span>
                </span>
              </div>
              <button
                onClick={handleSave}
                className={isSaved ? "text-blue-500" : "text-gray-500"}
                aria-label={isSaved ? "Unsave post" : "Save post"}
              >
                <Bookmark className={`h-6 w-6 ${isSaved ? "fill-current" : ""}`} />
              </button>
            </div>

            <Link href={`/profile/${post.author.username}`} className="flex min-w-0 items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={post.author.avatar} alt={post.author.username} />
                <AvatarFallback>{post.author.username[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="truncate font-medium">{post.author.username}</span>
            </Link>

            {post.caption && <p className="whitespace-pre-wrap wrap-anywhere">{post.caption}</p>}
            <p className="text-sm text-muted-foreground">
              {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
            </p>

            <div className="space-y-4">
              {comments.map((item) => (
                <div key={item._id} className="flex gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={item.avatar} alt={item.username} />
                    <AvatarFallback>{item.username[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="wrap-anywhere">
                      <span className="font-medium mr-2">{item.username}</span>
                      {item.text}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {user ? (
              <form onSubmit={handleComment} className="flex gap-2">
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 rounded-full border border-input bg-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isSubmitting}
                />
                <button
                  type="submit"
                  disabled={!comment.trim() || isSubmitting}
                  className="rounded-full bg-blue-500 p-2 text-white disabled:opacity-50"
                  aria-label="Post comment"
                >
                  <Send className="h-5 w-5" />
                </button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                <Link href="/login" className="text-blue-500 hover:underline">Log in</Link> to comment.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Similar Posts</h2>
        {similarPosts.length === 0 ? (
          <p className="text-muted-foreground">No similar posts yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {similarPosts.map((similarPost) => (
              <Link
                key={similarPost._id}
                href={`/p/${similarPost._id}`}
                className="relative block aspect-square overflow-hidden rounded-lg bg-muted"
              >
                {similarPost.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, any host
                  <img src={similarPost.image} alt={similarPost.caption} loading="lazy" className="h-full w-full object-cover" />
                ) : similarPost.code ? (
                  <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-50">
                    <Code className="h-8 w-8" />
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-2 text-center text-sm text-muted-foreground">
                    {similarPost.caption}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
