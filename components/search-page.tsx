"use client"
import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { MainLayout } from "@/components/main-layout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"

interface SearchResult {
  users: Array<{
    _id: string
    username: string
    fullName: string
    avatar: string
    bio: string
  }>
  posts: Array<{
    _id: string
    content: string
    image?: string
    author: {
      _id: string
      username: string
      avatar: string
    }
    createdAt: string
  }>
}

export function SearchPage() {
  const searchParams = useSearchParams()
  const query = searchParams.get("q") || ""
  const type = searchParams.get("type") || "all"
  const [results, setResults] = useState<SearchResult>({ users: [], posts: [] })
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState(type)
  const { token } = useAuth()

  useEffect(() => {
    const fetchResults = async () => {
      if (!query.trim()) {
        setResults({ users: [], posts: [] })
        return
      }

      setIsLoading(true)
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=${activeTab}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        if (!response.ok) {
          throw new Error("Search failed")
        }

        const data = await response.json()
        setResults(data)
      } catch (error) {
        console.error("Search error:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchResults()
  }, [query, activeTab, token])

  return (
    <MainLayout>
      <div className="container py-6">
        <h1 className="mb-6 text-2xl font-bold">
          Search results for &quot;{query}&quot;
        </h1>

        <Tabs defaultValue={type} value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 grid w-full grid-cols-3">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            {isLoading ? (
              <div className="text-center">Loading...</div>
            ) : (
              <>
                {results.users.length > 0 && (
                  <div className="mb-8">
                    <h2 className="mb-4 text-xl font-semibold">Users</h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {results.users.map((user) => (
                        <Link
                          key={user._id}
                          href={`/profile/${user.username}`}
                          className="block"
                        >
                          <Card className="h-full transition-colors hover:bg-muted">
                            <CardContent className="flex items-center gap-4 p-4">
                              <Avatar className="h-12 w-12">
                                <AvatarImage src={user.avatar} alt={user.username} />
                                <AvatarFallback>{user.username[0]}</AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium">{user.username}</div>
                                <div className="text-sm text-muted-foreground">{user.fullName}</div>
                                {user.bio && (
                                  <p className="mt-1 text-sm line-clamp-2">{user.bio}</p>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {results.posts.length > 0 && (
                  <div>
                    <h2 className="mb-4 text-xl font-semibold">Posts</h2>
                    <div className="grid gap-4 md:grid-cols-2">
                      {results.posts.map((post) => (
                        <Link
                          key={post._id}
                          href={`/p/${post._id}`}
                          className="block"
                        >
                          <Card className="h-full transition-colors hover:bg-muted">
                            <CardContent className="p-4">
                              <div className="mb-3 flex items-center gap-2">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={post.author.avatar} alt={post.author.username} />
                                  <AvatarFallback>{post.author.username[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-medium">{post.author.username}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                                  </div>
                                </div>
                              </div>
                              <p className="line-clamp-3">{post.content}</p>
                              {post.image && (
                                <div className="mt-3 aspect-video overflow-hidden rounded-md">
                                  <img
                                    src={post.image}
                                    alt="Post image"
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {results.users.length === 0 && results.posts.length === 0 && (
                  <div className="text-center text-muted-foreground">
                    No results found
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="users">
            {isLoading ? (
              <div className="text-center">Loading...</div>
            ) : results.users.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {results.users.map((user) => (
                  <Link
                    key={user._id}
                    href={`/profile/${user.username}`}
                    className="block"
                  >
                    <Card className="h-full transition-colors hover:bg-muted">
                      <CardContent className="flex items-center gap-4 p-4">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={user.avatar} alt={user.username} />
                          <AvatarFallback>{user.username[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{user.username}</div>
                          <div className="text-sm text-muted-foreground">{user.fullName}</div>
                          {user.bio && (
                            <p className="mt-1 text-sm line-clamp-2">{user.bio}</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground">
                No users found
              </div>
            )}
          </TabsContent>

          <TabsContent value="posts">
            {isLoading ? (
              <div className="text-center">Loading...</div>
            ) : results.posts.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {results.posts.map((post) => (
                  <Link
                    key={post._id}
                    href={`/p/${post._id}`}
                    className="block"
                  >
                    <Card className="h-full transition-colors hover:bg-muted">
                      <CardContent className="p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={post.author.avatar} alt={post.author.username} />
                            <AvatarFallback>{post.author.username[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{post.author.username}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                            </div>
                          </div>
                        </div>
                        <p className="line-clamp-3">{post.content}</p>
                        {post.image && (
                          <div className="mt-3 aspect-video overflow-hidden rounded-md">
                            <img
                              src={post.image}
                              alt="Post image"
                              className="h-full w-full object-cover"
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground">
                No posts found
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  )
} 