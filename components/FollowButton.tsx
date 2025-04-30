import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Button } from "./ui/button"
import { Loader2 } from "lucide-react"

interface FollowButtonProps {
  userId: string
  className?: string
}

export default function FollowButton({ userId, className }: FollowButtonProps) {
  const { data: session } = useSession()
  const [isFollowing, setIsFollowing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (session?.user) {
      checkFollowStatus()
    }
  }, [session?.user, userId])

  const checkFollowStatus = async () => {
    try {
      const response = await fetch(`/api/follow?userId=${userId}`)
      const data = await response.json()
      setIsFollowing(data.isFollowing)
    } catch (error) {
      console.error("Error checking follow status:", error)
    }
  }

  const handleFollow = async () => {
    if (!session?.user) return

    setIsLoading(true)
    try {
      const response = await fetch("/api/follow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      })

      if (response.ok) {
        const data = await response.json()
        setIsFollowing(data.isFollowing)
      }
    } catch (error) {
      console.error("Error following/unfollowing:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!session?.user || session.user.id === userId) {
    return null
  }

  return (
    <Button
      variant={isFollowing ? "outline" : "default"}
      onClick={handleFollow}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isFollowing ? (
        "Unfollow"
      ) : (
        "Follow"
      )}
    </Button>
  )
} 