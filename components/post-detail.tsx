"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Heart, MessageCircle, Bookmark, Share2, CheckCircle2, Send } from "lucide-react"
import { VideoPlayer } from "./video-player"
import type { PostType, CommentType } from "@/lib/types"
import { usePosts } from "@/contexts/posts-context"
import { useAuth } from "@/contexts/auth-context"
import { formatDistanceToNow } from "date-fns"

interface PostDetailProps {
  post: PostType
}

export function PostDetail({ post }: PostDetailProps) {
  const { user } = useAuth()
  const { likePost, savePost, addComment } = usePosts()
  const [similarPosts, setSimilarPosts] = useState<PostType[]>([])
  
  // Ensure post has required properties with defaults
  const postData = {
    ...post,
    likes: post.likes || 0,
    comments: post.comments || [],
    likedBy: post.likedBy || [],
    saved: post.saved || false,
    author: {
      ...post.author,
      verified: post.author?.verified || false
    }
  }

  const [isLiked, setIsLiked] = useState(postData.likedBy.includes(user?.username || ''))
  const [isSaved, setIsSaved] = useState(postData.saved)
  const [likes, setLikes] = useState(postData.likes)
  const [comment, setComment] = useState("")
  const [comments, setComments] = useState<CommentType[]>(postData.comments)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Update local state when post data changes
    setIsLiked(postData.likedBy.includes(user?.username || ''))
    setLikes(postData.likes)
  }, [postData.likedBy, postData.likes, user?.username])

  useEffect(() => {
    // Fetch similar posts based on tags or content
    const fetchSimilarPosts = async () => {
      try {
        const response = await fetch(`/api/posts/similar/${post._id}`)
        const data = await response.json()
        setSimilarPosts(data)
      } catch (error) {
        console.error("Error fetching similar posts:", error)
      }
    }

    fetchSimilarPosts()
  }, [post._id])

  const handleLike = async () => {
    try {
      const updatedPost = await likePost(post._id)
      setIsLiked(updatedPost.likedBy.includes(user?.username || ''))
      setLikes(updatedPost.likes)
    } catch (error) {
      console.error("Error liking post:", error)
    }
  }

  const handleSave = async () => {
    try {
      await savePost(post._id)
      setIsSaved(!isSaved)
    } catch (error) {
      console.error("Error saving post:", error)
    }
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim() || !user) return

    setIsLoading(true)
    try {
      const newComment = await addComment(post._id, comment)
      setComments([...comments, newComment])
      setComment("")
    } catch (error) {
      console.error("Error adding comment:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto p-4">
      <div className="space-y-4">
        {/* Post Content */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {postData.image && (
            <div className="relative aspect-square">
              <Image
                src={postData.image}
                alt={postData.caption || "Post image"}
                fill
                className="object-cover"
              />
            </div>
          )}
          {postData.video && (
            <div className="aspect-square">
              <VideoPlayer
                url={postData.video}
                className="w-full h-full"
                autoPlay
                muted
                loop
                playsInline
              />
            </div>
          )}
          {postData.code && (
            <div className="p-4 bg-zinc-950 text-zinc-50">
              <pre className="overflow-x-auto">
                <code>{postData.code}</code>
              </pre>
            </div>
          )}
          
          {/* Post Actions */}
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleLike}
                  className={`flex items-center gap-1 hover:bg-transparent ${isLiked ? "text-red-500 hover:text-red-600" : "text-gray-500 hover:text-gray-600"}`}
                  aria-label={isLiked ? "Unlike post" : "Like post"}
                >
                  <Heart className={`h-6 w-6 ${isLiked ? "fill-current" : ""}`} />
                  <span>{likes}</span>
                </button>
                <button 
                  className="flex items-center gap-1 text-gray-500"
                  aria-label="View comments"
                >
                  <MessageCircle className="h-6 w-6" />
                  <span>{comments.length}</span>
                </button>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={handleSave}
                  className={`text-gray-500 ${isSaved ? "text-blue-500" : ""}`}
                  aria-label={isSaved ? "Unsave post" : "Save post"}
                >
                  <Bookmark className={`h-6 w-6 ${isSaved ? "fill-current" : ""}`} />
                </button>
                <button 
                  className="text-gray-500"
                  aria-label="Share post"
                >
                  <Share2 className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* Author Info */}
            <div className="flex items-center gap-2">
              <Image
                src={postData.author.avatar}
                alt={postData.author.username}
                width={32}
                height={32}
                className="rounded-full"
              />
              <div className="flex items-center gap-1">
                <span className="font-medium">{postData.author.username}</span>
                {postData.author.verified && (
                  <CheckCircle2 className="h-4 w-4 text-blue-500 fill-current" />
                )}
              </div>
            </div>

            {/* Caption */}
            {postData.caption && (
              <p className="text-gray-800">{postData.caption}</p>
            )}

            {/* Comments */}
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.createdAt} className="flex gap-2">
                  <Image
                    src={comment.avatar}
                    alt={comment.username}
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-medium">{comment.username}</span>
                      <p className="text-gray-800">{comment.text}</p>
                    </div>
                    <p className="text-sm text-gray-500">
                      {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Comment */}
            {user && (
              <form onSubmit={handleComment} className="flex gap-2">
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 rounded-full border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={!comment.trim() || isLoading}
                  className="rounded-full bg-blue-500 p-2 text-white disabled:opacity-50"
                  aria-label="Post comment"
                >
                  <Send className="h-5 w-5" />
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Similar Posts */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Similar Posts</h2>
        <div className="grid grid-cols-2 gap-4">
          {similarPosts.map((similarPost) => (
            <div key={similarPost._id} className="relative aspect-square overflow-hidden rounded-lg">
              {similarPost.image ? (
                <Image
                  src={similarPost.image}
                  alt="Similar post"
                  fill
                  className="object-cover"
                />
              ) : similarPost.video ? (
                <VideoPlayer
                  url={similarPost.video}
                  className="w-full h-full"
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
