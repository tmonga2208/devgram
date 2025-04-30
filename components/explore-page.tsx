"use client"

import { usePosts } from "@/contexts/posts-context"
import { ExplorePost } from "@/components/explore-post"

export function ExplorePage() {
  const { posts, loading, error } = usePosts()

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-2xl font-bold">Explore</h1>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-square animate-pulse bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl text-center py-10">
        <p className="text-red-500">Error: {error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Try Again
        </button>
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="mx-auto max-w-6xl text-center py-10">
        <p className="text-gray-500 dark:text-gray-400">No posts to explore yet.</p>
      </div>
    )
  }

  // Shuffle posts to show different content on each visit
  const shuffledPosts = [...posts].sort(() => Math.random() - 0.5)

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-6 text-2xl font-bold">Explore</h1>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:gap-4">
        {shuffledPosts.map((post) => (
          <ExplorePost key={post._id} post={post} />
        ))}
      </div>
    </div>
  )
}
