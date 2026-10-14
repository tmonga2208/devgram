"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { Send } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import toast from "react-hot-toast"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useAuth } from "@/contexts/auth-context"
import { RequestError, usePosts } from "@/contexts/posts-context"
import type { CommentType } from "@/lib/types"
import { cn } from "@/lib/utils"

interface CommentsProps {
  postId: string
  comments: CommentType[]
  // Called with each comment the viewer adds.
  onAdded: (comment: CommentType) => void
  // Called when the post turns out to be deleted. Without it, a toast says so.
  onRemoved?: () => void
  // Extra classes for the list, so a panel can scroll it and keep the form in view.
  listClassName?: string
}

// A post's comments and the form to add one. Used by the post page and the
// DevBits comments panel.
export function Comments({ postId, comments, onAdded, onRemoved, listClassName }: CommentsProps) {
  const { user } = useAuth()
  const { addComment } = usePosts()
  const [text, setText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim() || !user) return

    setIsSubmitting(true)
    try {
      onAdded(await addComment(postId, text))
      setText("")
    } catch (error) {
      if (onRemoved && error instanceof RequestError && error.status === 404) onRemoved()
      else toast.error(error instanceof Error ? error.message : "Failed to add comment")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div className={cn("space-y-4", listClassName)}>
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
        <form onSubmit={submit} className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 rounded-full border border-input bg-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isSubmitting}
          />
          <button
            type="submit"
            disabled={!text.trim() || isSubmitting}
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
    </>
  )
}
