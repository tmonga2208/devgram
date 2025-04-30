"use client"
import Image from "next/image"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Grid, Settings } from "lucide-react"
import { usePosts } from "@/contexts/posts-context"
import { useAuth } from "@/contexts/auth-context"
import { ProfilePost } from "@/components/profile-post"
import { useEffect, useState } from "react"
import type { PostType, UserType } from "@/lib/types"
import { toast } from "react-hot-toast"
import { useRouter } from "next/navigation"

interface ProfileProps {
  username: string
}

export function Profile({ username }: ProfileProps) {
  const { user: currentUser, token } = useAuth()
  const { posts } = usePosts()
  const router = useRouter()
  const [userPosts, setUserPosts] = useState<PostType[]>([])
  const [savedPosts, setSavedPosts] = useState<PostType[]>([])
  const [user, setUser] = useState<UserType | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const response = await fetch(`/api/users/${username}`)
        if (!response.ok) throw new Error('Failed to fetch user profile')
        const userData = await response.json()
        setUser(userData)
        setIsFollowing(userData.isFollowing || false)
      } catch (error) {
        console.error('Error fetching user profile:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchUserProfile()
  }, [username])

  useEffect(() => {
    if (posts) {
      // Filter posts by this user
      const userPosts = posts.filter((post) => post.author.username === username)
      setUserPosts(userPosts)

      // Filter saved posts
      const savedPosts = posts.filter((post) => post.saved)
      setSavedPosts(savedPosts)
    }
  }, [posts, username])

  const handleFollow = async () => {
    if (!token || !user) return;
    
    setFollowLoading(true);
    try {
      const response = await fetch(`/api/users/${username}/follow`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) throw new Error('Failed to follow/unfollow user');
      
      const data = await response.json();
      setIsFollowing(data.following);
      setUser(prev => prev ? {
        ...prev,
        followers: data.followers,
      } : null);
    } catch (error) {
      console.error('Error following/unfollowing user:', error);
      toast.error('Failed to follow/unfollow user');
    } finally {
      setFollowLoading(false);
    }
  };

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

  const isOwnProfile = currentUser?.username === username

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex flex-col items-center gap-6 md:flex-row md:items-start md:gap-10">
        <div className="relative h-24 w-24 overflow-hidden rounded-full md:h-36 md:w-36">
          <Image 
            src={user.avatar || "/placeholder.svg"} 
            alt={user.username} 
            fill 
            className="object-cover" 
          />
        </div>
        <div className="flex flex-1 flex-col items-center text-center md:items-start md:text-left">
          <div className="mb-4 flex flex-col items-center gap-4 md:flex-row">
            <h1 className="text-2xl font-bold">{user.username}</h1>
            <div className="flex gap-2">
              {!isOwnProfile && (
                <>
                  <Button 
                    onClick={handleFollow}
                    disabled={followLoading}
                    variant={isFollowing ? "outline" : "default"}
                  >
                    {isFollowing ? "Unfollow" : "Follow"}
                  </Button>
                  <Button variant="outline" onClick={handleMessage}>Message</Button>
                </>
              )}
              {isOwnProfile && (
                <Button variant="ghost" size="icon">
                  <Settings className="h-4 w-4" />
                  <span className="sr-only">Settings</span>
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
          <div>
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
          </div>
        </div>
      </div>
      <Tabs defaultValue="posts">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="posts" className="flex items-center gap-2">
            <Grid className="h-4 w-4" />
            <span className="hidden sm:inline">Posts</span>
          </TabsTrigger>
          <TabsTrigger value="saved" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Saved</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="posts" className="mt-6">
          <div className="grid grid-cols-3 gap-1 md:gap-4">
            {userPosts.map((post) => (
              <ProfilePost key={post._id} post={post} />
            ))}
          </div>
        </TabsContent>
        <TabsContent value="saved" className="mt-6">
          <div className="grid grid-cols-3 gap-1 md:gap-4">
            {savedPosts.map((post) => (
              <ProfilePost key={post._id} post={post} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
