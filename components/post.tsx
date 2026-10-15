"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Heart, MessageCircle, Bookmark, MoreHorizontal, Code, Image as ImageIcon } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { usePosts } from "@/contexts/posts-context"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CodeBlock } from "@/components/code-block"
import { VideoPlayer } from "@/components/video-player"
import { MuxVideo } from "@/components/mux-video"
import type { PostType } from "@/lib/types"
import { postFiles } from "@/lib/code-files"
import toast from "react-hot-toast"

interface PostProps {
  post: PostType
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function Post({ post }: PostProps) {
  const [comment, setComment] = useState("")
  const [showComments, setShowComments] = useState(false)
  const { likePost, savePost, addComment, deletePost } = usePosts()
  const { user } = useAuth()
  const router = useRouter()

  const isAuthor = user?.username === post.author.username
  const isLiked = !!user && (post.likedBy || []).includes(user.username)
  const isSaved = !!user && (post.savedBy || []).includes(user.username)
  const comments = post.comments || []
  // A code post's first file (posts from before files keep their code on the post).
  const [firstFile] = postFiles(post)

  // Signed-out visitors are sent to log in instead of getting a failed request.
  const requireUser = () => {
    if (user) return true
    router.push("/login")
    return false
  }

  const handleLike = async () => {
    if (!requireUser()) return
    try {
      await likePost(post._id)
    } catch (error) {
      toast.error(messageOf(error, "Failed to update like"))
    }
  }

  const handleSave = async () => {
    if (!requireUser()) return
    try {
      await savePost(post._id)
      toast.success(isSaved ? "Post unsaved" : "Post saved")
    } catch (error) {
      toast.error(messageOf(error, "Failed to update save"))
    }
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) return

    try {
      await addComment(post._id, comment)
      setComment("")
    } catch (error) {
      toast.error(messageOf(error, "Failed to add comment"))
    }
  }

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this post?")) return
    try {
      await deletePost(post._id)
      toast.success("Post deleted successfully")
    } catch (error) {
      toast.error(messageOf(error, "Failed to delete post"))
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md overflow-hidden">
      {/* Post Header */}
      <div className="p-4 flex items-center justify-between">
        <Link href={`/profile/${post.author.username}`} className="flex min-w-0 items-center">
          <Avatar className="h-8 w-8">
            <AvatarImage src={post.author.avatar} alt={post.author.username} />
            <AvatarFallback>{post.author.username[0].toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="ml-3 truncate font-medium">{post.author.username}</span>
        </Link>
        {isAuthor && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-5 w-5" />
                <span className="sr-only">Post options</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Post Options</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Button variant="destructive" className="w-full" onClick={handleDelete}>
                  Delete Post
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Post Content */}
      <div className="relative">
        {post.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, any host
          <img src={post.image} alt={post.caption} loading="lazy" className="w-full object-cover" />
        ) : post.muxVideo ? (
          <MuxVideo playbackId={post.muxVideo.playbackId} aspectRatio={post.muxVideo.aspectRatio} title={post.caption} />
        ) : post.video ? (
          <VideoPlayer url={post.video} />
        ) : firstFile ? (
          <div className="bg-gray-100 dark:bg-gray-800 p-4 overflow-x-auto">
            <div className="flex items-center mb-2">
              <Code className="h-4 w-4 mr-2" />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {firstFile.language}
              </span>
            </div>
            <CodeBlock code={firstFile.code} language={firstFile.language} />
          </div>
        ) : (
          <div className="h-64 bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
            <ImageIcon className="h-12 w-12 text-gray-400" />
          </div>
        )}
      </div>

      {/* Post Actions */}
      <div className="p-4">
        <TooltipProvider>
          <div className="flex items-center space-x-4 mb-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLike}
                  className={`hover:bg-transparent ${isLiked ? "text-red-500 hover:text-red-600" : "text-gray-500 hover:text-gray-600"}`}
                >
                  <Heart className={`h-6 w-6 ${isLiked ? "fill-current" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isLiked ? "Unlike" : "Like"}</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setShowComments(!showComments)}>
                  <MessageCircle className="h-6 w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Comment</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSave}
                  className={isSaved ? "text-blue-500" : ""}
                >
                  <Bookmark className={`h-6 w-6 ${isSaved ? "fill-current" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isSaved ? "Unsave" : "Save"}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        <p className="font-medium">{post.likes} likes</p>
        <p className="mt-1 wrap-anywhere">
          <Link href={`/profile/${post.author.username}`} className="font-medium mr-2">
            {post.author.username}
          </Link>
          {post.caption}
        </p>
        <Link href={`/p/${post._id}`} className="block text-xs text-gray-500 dark:text-gray-400 mt-1 hover:underline">
          {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
        </Link>

        {/* Comments Section */}
        {showComments && (
          <div className="mt-4">
            <Separator className="my-2" />

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {comments.map((item) => (
                <div key={item._id} className="flex items-start">
                  <Avatar className="h-6 w-6 mr-2">
                    <AvatarImage src={item.avatar} alt={item.username} />
                    <AvatarFallback>{item.username[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm wrap-anywhere">
                      <span className="font-medium mr-2">{item.username}</span>
                      {item.text}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {user ? (
              <form onSubmit={handleComment} className="mt-4">
                <div className="flex items-center space-x-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.avatar} alt={user.username} />
                    <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <Textarea
                      placeholder="Add a comment..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="min-h-[80px]"
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-2">
                  <Button type="submit" disabled={!comment.trim()}>
                    Post
                  </Button>
                </div>
              </form>
            ) : (
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                <Link href="/login" className="text-blue-500 hover:underline">Log in</Link> to comment.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
