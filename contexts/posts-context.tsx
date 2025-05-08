"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './auth-context';
import type { PostType, CommentType } from "@/lib/types"

interface PostsContextType {
  posts: PostType[];
  loading: boolean;
  error: string | null;
  fetchPosts: () => Promise<void>;
  createPost: (data: Partial<PostType>) => Promise<void>;
  likePost: (postId: string) => Promise<PostType>;
  savePost: (postId: string) => Promise<void>;
  addComment: (postId: string, text: string) => Promise<CommentType>;
  deletePost: (postId: string) => Promise<void>;
}

const PostsContext = createContext<PostsContextType | undefined>(undefined);

export function PostsProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<PostType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { token, user } = useAuth();

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/posts');
      
      if (!response.ok) {
        throw new Error('Failed to fetch posts');
      }
      
      const data = await response.json();
      setPosts(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch posts');
    } finally {
      setLoading(false);
    }
  };

  const createPost = async (data: Partial<PostType>) => {
    try {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create post');
      }
      
      const newPost = await response.json();
      setPosts(prevPosts => [newPost, ...prevPosts]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
      throw err;
    }
  };

  const likePost = async (postId: string) => {
    try {
      const response = await fetch(`/api/posts/${postId}/like`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to like post')
      }

      const updatedPost = await response.json()
      
      // Update the post in the posts array
      setPosts(posts.map(post => 
        post._id === postId ? {
          ...post,
          likes: updatedPost.likes,
          likedBy: updatedPost.likedBy
        } : post
      ))

      return updatedPost
    } catch (error) {
      console.error('Error liking post:', error)
      throw error
    }
  }

  const savePost = async (postId: string) => {
    try {
      const response = await fetch(`/api/posts/${postId}/save`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to save post');
      }
      
      setPosts(prevPosts => 
        prevPosts.map(post => 
          post._id === postId ? { ...post, saved: !post.saved } : post
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save post');
    }
  };

  const addComment = async (postId: string, text: string): Promise<CommentType> => {
    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add comment');
      }
      
      const newComment = await response.json();
      setPosts(prevPosts => 
        prevPosts.map(post => 
          post._id === postId ? { ...post, comments: [...post.comments, newComment] } : post
        )
      );

      return newComment;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add comment');
      throw err;
    }
  };

  const deletePost = async (postId: string) => {
    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete post');
      }
      
      setPosts(prevPosts => prevPosts.filter(post => post._id !== postId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete post');
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  return (
    <PostsContext.Provider
      value={{
        posts,
        loading,
        error,
        fetchPosts,
        createPost,
        likePost,
        savePost,
        addComment,
        deletePost,
      }}
    >
      {children}
    </PostsContext.Provider>
  );
}

export function usePosts() {
  const context = useContext(PostsContext);
  if (context === undefined) {
    throw new Error('usePosts must be used within a PostsProvider');
  }
  return context;
} 