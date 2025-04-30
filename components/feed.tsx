"use client"

import { Post } from "@/components/post"
import { usePosts } from "@/contexts/posts-context"

export function Feed() {
  const { posts, loading, error } = usePosts()

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div className="animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-200 dark:bg-gray-800 rounded-lg p-4 mb-6">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-gray-300 dark:bg-gray-700 rounded-full"></div>
                <div className="ml-3">
                  <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-24"></div>
                </div>
              </div>
              <div className="h-64 bg-gray-300 dark:bg-gray-700 rounded mb-4"></div>
              <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg text-center py-10">
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
      <div className="mx-auto max-w-lg text-center py-10">
        <p className="text-gray-500 dark:text-gray-400">No posts yet. Be the first to share something!</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {posts.map((post) => (
        <Post key={post._id} post={post} />
      ))}
    </div>
  )
}
