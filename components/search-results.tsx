import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { mockUsers, mockPosts } from "@/lib/mock-data"
import { ExplorePost } from "@/components/explore-post"

interface SearchResultsProps {
  query: string
}

export function SearchResults({ query }: SearchResultsProps) {
  // Filter users and posts based on the query
  const filteredUsers = query
    ? mockUsers.filter(
        (user) =>
          user.username.toLowerCase().includes(query.toLowerCase()) ||
          user.fullName.toLowerCase().includes(query.toLowerCase()),
      )
    : []

  const filteredPosts = query
    ? mockPosts.filter(
        (post) =>
          post.caption.toLowerCase().includes(query.toLowerCase()) ||
          post.author.username.toLowerCase().includes(query.toLowerCase()),
      )
    : []

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold">{query ? `Search results for "${query}"` : "Search"}</h1>

      {!query && (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-muted-foreground">Enter a search term to find users and posts</p>
        </div>
      )}

      {query && filteredUsers.length === 0 && filteredPosts.length === 0 && (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-muted-foreground">No results found for "{query}"</p>
        </div>
      )}

      {filteredUsers.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">Users</h2>
          <div className="space-y-4">
            {filteredUsers.map((user) => (
              <Link
                key={user.username}
                href={`/profile/${user.username}`}
                className="flex items-center gap-4 rounded-lg p-4 transition-colors hover:bg-muted"
              >
                <Avatar>
                  <AvatarImage src={user.avatar || "/placeholder.svg"} alt={user.username} />
                  <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{user.username}</p>
                  <p className="text-sm text-muted-foreground">{user.fullName}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {filteredPosts.length > 0 && (
        <div>
          <h2 className="mb-4 text-xl font-semibold">Posts</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {filteredPosts.map((post) => (
              <ExplorePost key={post._id} post={post} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
