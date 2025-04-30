"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { formatDistanceToNow } from "date-fns"
import { Heart, Send, MessageCircle, Bookmark, MoreHorizontal, Code, Image as ImageIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { mockPosts } from "@/lib/mock-data"
import { CodeBlock } from "@/components/code-block"
import { usePosts } from "@/contexts/posts-context"
import { useAuth } from "@/contexts/auth-context"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"

interface PostDetailProps {
  post: {
    _id: string
    image?: string
    code?: string
    language?: string
    caption: string
    author: {
      username: string
      avatar?: string
    }
    createdAt: string
    comments: Array<{
      id: string
      text: string
      author: {
        username: string
        avatar?: string
      }
      createdAt: string
    }>
    likes: number
    liked: boolean
  }
}

export function PostDetail({ post }: PostDetailProps) {
  const [comment, setComment] = useState("")
  const [isLiked, setIsLiked] = useState(post.liked)
  const [likesCount, setLikesCount] = useState(post.likes)

  const handleLike = () => {
    setIsLiked(!isLiked)
    setLikesCount(isLiked ? likesCount - 1 : likesCount + 1)
  }

  const handleComment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) return
    // TODO: Implement comment functionality
    setComment("")
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b">
        <Avatar>
          <AvatarImage src={post.author.avatar} alt={post.author.username} />
          <AvatarFallback>{post.author.username[0].toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold">{post.author.username}</p>
          <p className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {post.image && (
          <div className="mb-4">
            <img src={post.image} alt={post.caption} className="w-full rounded-lg" />
          </div>
        )}
        {post.code && (
          <div className="mb-4">
            <CodeBlock code={post.code} language={post.language || "plaintext"} />
          </div>
        )}
        <p className="mb-4">{post.caption}</p>

        <div className="space-y-4">
          {post.comments.map((comment, index) => (
            <div key={comment.id} className="flex gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={comment.author.avatar} alt={comment.author.username} />
                <AvatarFallback>{comment.author.username[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{comment.author.username}</p>
                <p>{comment.text}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t p-4">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="icon" onClick={handleLike}>
            <Heart className={`h-6 w-6 ${isLiked ? "fill-current text-red-500" : ""}`} />
          </Button>
          <span>{likesCount} likes</span>
        </div>

        <form onSubmit={handleComment} className="flex gap-2">
          <Input
            placeholder="Add a comment..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <Button type="submit" size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}
