import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Search as SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import Link from "next/link"

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

export function Search() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult>({ users: [], posts: [] })
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("all")
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { token } = useAuth()

  // Handle click outside to close search results
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // Fetch search results
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
        setShowResults(true)
      } catch (error) {
        console.error("Search error:", error)
      } finally {
        setIsLoading(false)
      }
    }

    const debounceTimer = setTimeout(fetchResults, 300)
    return () => clearTimeout(debounceTimer)
  }, [query, activeTab, token])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}&type=${activeTab}`)
      setShowResults(false)
    }
  }

  return (
    <div ref={searchRef} className="relative w-full max-w-md">
      <form onSubmit={handleSearch} className="relative">
        <Input
          type="text"
          placeholder="Search users and posts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pr-10"
        />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          className="absolute right-0 top-0 h-full"
        >
          <SearchIcon className="h-4 w-4" />
        </Button>
      </form>

      {showResults && (query.trim() || isLoading) && (
        <Card className="absolute z-50 mt-1 w-full">
          <CardContent className="p-0">
            <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="users">Users</TabsTrigger>
                <TabsTrigger value="posts">Posts</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="p-2">
                {isLoading ? (
                  <div className="p-4 text-center">Loading...</div>
                ) : (
                  <>
                    {results.users.length > 0 && (
                      <div className="mb-4">
                        <h3 className="mb-2 text-sm font-medium">Users</h3>
                        <div className="space-y-2">
                          {results.users.map((user) => (
                            <Link
                              key={user._id}
                              href={`/profile/${user.username}`}
                              className="flex items-center gap-2 rounded-md p-2 hover:bg-muted"
                              onClick={() => setShowResults(false)}
                            >
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={user.avatar} alt={user.username} />
                                <AvatarFallback>{user.username[0]}</AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium">{user.username}</div>
                                <div className="text-xs text-muted-foreground">{user.fullName}</div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {results.posts.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-medium">Posts</h3>
                        <div className="space-y-2">
                          {results.posts.map((post) => (
                            <Link
                              key={post._id}
                              href={`/p/${post._id}`}
                              className="block rounded-md p-2 hover:bg-muted"
                              onClick={() => setShowResults(false)}
                            >
                              <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={post.author.avatar} alt={post.author.username} />
                                  <AvatarFallback>{post.author.username[0]}</AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-medium">{post.author.username}</span>
                              </div>
                              <p className="mt-1 text-sm line-clamp-2">{post.content}</p>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {results.users.length === 0 && results.posts.length === 0 && (
                      <div className="p-4 text-center text-muted-foreground">
                        No results found
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="users" className="p-2">
                {isLoading ? (
                  <div className="p-4 text-center">Loading...</div>
                ) : results.users.length > 0 ? (
                  <div className="space-y-2">
                    {results.users.map((user) => (
                      <Link
                        key={user._id}
                        href={`/profile/${user.username}`}
                        className="flex items-center gap-2 rounded-md p-2 hover:bg-muted"
                        onClick={() => setShowResults(false)}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar} alt={user.username} />
                          <AvatarFallback>{user.username[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{user.username}</div>
                          <div className="text-xs text-muted-foreground">{user.fullName}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-muted-foreground">
                    No users found
                  </div>
                )}
              </TabsContent>

              <TabsContent value="posts" className="p-2">
                {isLoading ? (
                  <div className="p-4 text-center">Loading...</div>
                ) : results.posts.length > 0 ? (
                  <div className="space-y-2">
                    {results.posts.map((post) => (
                      <Link
                        key={post._id}
                        href={`/p/${post._id}`}
                        className="block rounded-md p-2 hover:bg-muted"
                        onClick={() => setShowResults(false)}
                      >
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={post.author.avatar} alt={post.author.username} />
                            <AvatarFallback>{post.author.username[0]}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">{post.author.username}</span>
                        </div>
                        <p className="mt-1 text-sm line-clamp-2">{post.content}</p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-muted-foreground">
                    No posts found
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 