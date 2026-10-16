"use client"
import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Bookmark, Clapperboard, Grid, Settings } from "lucide-react"
import { ProfileDevBits } from "@/components/profile-devbits"
import { GitHubMark } from "@/components/github-mark"
import { usePosts } from "@/contexts/posts-context"
import { useAuth } from "@/contexts/auth-context"
import { ProfilePost } from "@/components/profile-post"
import { useEffect, useState } from "react"
import type { UserType } from "@/lib/types"
import { toast } from "react-hot-toast"
import { useRouter } from "next/navigation"

interface ProfileProps {
  username: string
}

export function Profile({ username }: ProfileProps) {
  const { user: currentUser, authFetch, loading: authLoading } = useAuth()
  const { posts } = usePosts()
  const router = useRouter()
  const [user, setUser] = useState<UserType | null>(null)
  const [loading, setLoading] = useState(true)
  const [followLoading, setFollowLoading] = useState(false)

  useEffect(() => {
    // Wait for the stored session, so the request carries the token and
    // the response's isFollowing is about this viewer.
    if (authLoading) return
    let cancelled = false

    const fetchUserProfile = async () => {
      try {
        const response = await authFetch(`/api/users/${username}`)
        if (cancelled) return
        setUser(response.ok ? await response.json() : null)
      } catch (error) {
        console.error('Error fetching user profile:', error)
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchUserProfile()
    return () => {
      cancelled = true
    }
  }, [username, authFetch, authLoading])

  const isOwnProfile = currentUser?.username === username
  const userPosts = posts.filter((post) => post.author.username === username)
  const savedPosts = currentUser
    ? posts.filter((post) => (post.savedBy || []).includes(currentUser.username))
    : []

  const handleFollow = async () => {
    if (!currentUser) {
      router.push('/login')
      return
    }
    if (!user) return

    setFollowLoading(true)
    try {
      const response = await authFetch(`/api/users/${username}/follow`, { method: 'POST' })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data) throw new Error(data?.error || 'Failed to follow/unfollow user')

      setUser(prev => prev ? { ...prev, isFollowing: data.following, followers: data.followers } : null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to follow/unfollow user')
    } finally {
      setFollowLoading(false)
    }
  }

  const handleMessage = () => {
    router.push(`/direct?user=${username}`)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="animate-pulse">
          <div className="mb-8 flex flex-col items-center gap-6 md:flex-row md:items-start md:gap-10">
            <div className="h-24 w-24 rounded-full bg-gray-200 dark:bg-gray-800 md:h-36 md:w-36" />
            <div className="flex-1 space-y-4">
              <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl text-center py-10">
        <p className="text-red-500">User not found</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex flex-col items-center gap-6 md:flex-row md:items-start md:gap-10">
        <div className="relative h-24 w-24 overflow-hidden rounded-full md:h-36 md:w-36">
          {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, any host */}
          <img
            src={user.avatar || "/placeholder.svg"}
            alt={user.username}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="flex flex-1 flex-col items-center text-center md:items-start md:text-left">
          <div className="mb-4 flex flex-col items-center gap-4 md:flex-row">
            <h1 className="max-w-full text-2xl font-bold wrap-anywhere">{user.username}</h1>
            <div className="flex gap-2">
              {!isOwnProfile && (
                <>
                  <Button
                    onClick={handleFollow}
                    disabled={followLoading}
                    variant={user.isFollowing ? "outline" : "default"}
                  >
                    {user.isFollowing ? "Unfollow" : "Follow"}
                  </Button>
                  <Button variant="outline" onClick={handleMessage}>Message</Button>
                </>
              )}
              {isOwnProfile && (
                <Button variant="ghost" size="icon" asChild>
                  <Link href="/settings">
                    <Settings className="h-4 w-4" />
                    <span className="sr-only">Settings</span>
                  </Link>
                </Button>
              )}
            </div>
          </div>
          <div className="mb-4 flex gap-6">
            <div className="text-center">
              <span className="font-bold">{userPosts.length}</span>{" "}
              <span className="text-muted-foreground">posts</span>
            </div>
            <div className="text-center">
              <span className="font-bold">{user.followers || 0}</span>{" "}
              <span className="text-muted-foreground">followers</span>
            </div>
            <div className="text-center">
              <span className="font-bold">{user.following || 0}</span>{" "}
              <span className="text-muted-foreground">following</span>
            </div>
          </div>
          <div className="max-w-full wrap-anywhere">
            <p className="font-medium">{user.fullName}</p>
            <p className="whitespace-pre-wrap">{user.bio}</p>
            {user.website && (
              <a
                href={user.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {user.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            {user.github && (
              <p>
                <a
                  href={`https://github.com/${user.github.login}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-github-link
                  className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
                >
                  <GitHubMark className="h-4 w-4 shrink-0" />
                  {user.github.login}
                </a>
              </p>
            )}
          </div>
        </div>
      </div>
      <Tabs defaultValue="posts">
        <TabsList className={`grid w-full ${isOwnProfile ? "grid-cols-3" : "grid-cols-2"}`}>
          <TabsTrigger value="posts" className="flex items-center gap-2">
            <Grid className="h-4 w-4" />
            <span className="hidden sm:inline">Posts</span>
          </TabsTrigger>
          <TabsTrigger value="devbits" className="flex items-center gap-2">
            <Clapperboard className="h-4 w-4" />
            <span className="hidden sm:inline">DevBits</span>
          </TabsTrigger>
          {isOwnProfile && (
            <TabsTrigger value="saved" className="flex items-center gap-2">
              <Bookmark className="h-4 w-4" />
              <span className="hidden sm:inline">Saved</span>
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="posts" className="mt-6">
          {userPosts.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">No posts yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1 md:gap-4">
              {userPosts.map((post) => (
                <ProfilePost key={post._id} post={post} />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="devbits" className="mt-6">
          <ProfileDevBits username={username} />
        </TabsContent>
        {isOwnProfile && (
          <TabsContent value="saved" className="mt-6">
            {savedPosts.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground">No saved posts yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1 md:gap-4">
                {savedPosts.map((post) => (
                  <ProfilePost key={post._id} post={post} />
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
