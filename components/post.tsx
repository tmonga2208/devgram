"use client"

import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Heart, MessageCircle, Bookmark, MoreHorizontal, Code, Image as ImageIcon, Video as VideoIcon } from "lucide-react"
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
import toast from "react-hot-toast"

interface PostProps {
  post: {
    _id: string;
    author: {
      username: string;
      avatar: string;
    };
    image?: string;
    video?: string;
    code?: string;
    language?: string;
    caption: string;
    likes: number;
    comments: Array<{
      _id: string;
      username: string;
      avatar: string;
      text: string;
      likes: number;
      createdAt: string;
    }>;
    createdAt: string;
    likedBy: Array<string>;
    saved: boolean;
  } & { [key: string]: any };
}

export function Post({ post }: PostProps) {
  const [comment, setComment] = useState("")
  const [showComments, setShowComments] = useState(false)
  const { likePost, savePost, addComment, deletePost } = usePosts()
  const { user } = useAuth()
  const isAuthor = user?.username === post.author.username

  const isLiked = post.likedBy?.includes(user?.username || '')
  const [likes, setLikes] = useState(post.likes)

  const handleLike = async () => {
    try {
      const updatedPost = await likePost(post._id)
      setLikes(updatedPost.likes)
      toast.success(isLiked ? 'Post unliked' : 'Post liked')
    } catch (error) {
      console.error('Error liking post:', error)
      toast.error('Failed to update like')
    }
  }

  const handleSave = async () => {
    try {
      const promise = savePost(post._id)
      toast.promise(promise, {
        loading: 'Updating save...',
        success: post.saved ? 'Post unsaved' : 'Post saved',
        error: 'Failed to update save',
      })
      await promise
    } catch {
      toast.error('Failed to update save')
    }
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) return
    
    try {
      const promise = addComment(post._id, comment)
      toast.promise(promise, {
        loading: 'Adding comment...',
        success: 'Comment added successfully',
        error: 'Failed to add comment',
      })
      await promise
      setComment("")
    } catch {
      toast.error('Failed to add comment')
    }
  }

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this post?")) {
      try {
        const promise = deletePost(post._id)
        toast.promise(promise, {
          loading: 'Deleting post...',
          success: 'Post deleted successfully',
          error: 'Failed to delete post',
        })
        await promise
      } catch {
        toast.error('Failed to delete post')
      }
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md overflow-hidden">
      {/* Post Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center">
          <Avatar className="h-8 w-8">
            <AvatarImage src={post.author.avatar} alt={post.author.username} />
            <AvatarFallback>{post.author.username[0].toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="ml-3 font-medium">{post.author.username}</span>
        </div>
        {isAuthor && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Post Options</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Button 
                  variant="destructive" 
                  className="w-full" 
                  onClick={handleDelete}
                >
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
          <img 
            src={post.image} 
            alt={post.caption} 
            className="w-full object-cover"
          />
        ) : post.video ? (
          <VideoPlayer url={post.video} />
        ) : post.code ? (
          <div className="bg-gray-100 dark:bg-gray-800 p-4 overflow-x-auto">
            <div className="flex items-center mb-2">
              <Code className="h-4 w-4 mr-2" />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {post.language || "javascript"}
              </span>
            </div>
            <CodeBlock code={post.code} language={post.language || "javascript"} />
          </div>
        ) : (
          <div className="h-64 bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
            {post.video ? (
              <VideoIcon className="h-12 w-12 text-gray-400" />
            ) : (
              <ImageIcon className="h-12 w-12 text-gray-400" />
            )}
          </div>
        )}
      </div>

      {/* Post Actions */}
      <div className="p-4">
        <div className="flex items-center space-x-4 mb-2">
          <TooltipProvider>
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
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setShowComments(!showComments)}
                >
                  <MessageCircle className="h-6 w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Comment</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleSave}
                  className={post.saved ? "text-blue-500" : ""}
                >
                  <Bookmark className={`h-6 w-6 ${post.saved ? "fill-current" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{post.saved ? "Unsave" : "Save"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <p className="font-medium">{likes} likes</p>
        <p className="mt-1">
          <span className="font-medium mr-2">{post.author.username}</span>
          {post.caption}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
        </p>

        {/* Comments Section */}
        {showComments && (
          <div className="mt-4">
            <Separator className="my-2" />
            
            {/* Comments List */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {post.comments.map((comment) => (
                <div key={comment._id} className="flex items-start">
                  <Avatar className="h-6 w-6 mr-2">
                    <AvatarImage src={comment.avatar} alt={comment.username} />
                    <AvatarFallback>{comment.username[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm">
                      <span className="font-medium mr-2">{comment.username}</span>
                      {comment.text}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Comment Form */}
            {user && (
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
            )}
          </div>
        )}
      </div>
    </div>
  )
}
