"use client"

import { createContext, useCallback, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './auth-context';
import type { PostType, CommentType } from "@/lib/types"
import type { CodeFile } from '@/lib/code-files';

export interface NewPost {
  caption: string;
  image?: string;
  video?: string;
  files?: CodeFile[];
  videoUploadId?: string;
  kind?: 'post' | 'devbit';
}

interface PostsContextType {
  posts: PostType[];
  loading: boolean;
  error: string | null;
  fetchPosts: () => Promise<void>;
  createPost: (data: NewPost) => Promise<PostType>;
  likePost: (postId: string) => Promise<PostType>;
  savePost: (postId: string) => Promise<PostType>;
  addComment: (postId: string, text: string) => Promise<CommentType>;
  deletePost: (postId: string) => Promise<void>;
}

const PostsContext = createContext<PostsContextType | undefined>(undefined);

// A request the server refused, with its message and HTTP status.
export class RequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Parses a successful response, or throws a RequestError with the server's message.
async function parseOrThrow<T>(response: Response, fallback: string): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new RequestError(data?.error || fallback, response.status);
  }
  return data as T;
}

export function PostsProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<PostType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { authFetch, loading: authLoading } = useAuth();

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      // Sent with the token when there is one, so each post carries the viewer's own save.
      const response = await authFetch('/api/posts');
      setPosts(await parseOrThrow<PostType[]>(response, 'Failed to fetch posts'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch posts');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  const replacePost = (updated: PostType) => {
    setPosts(prevPosts => prevPosts.map(post => (post._id === updated._id ? updated : post)));
  };

  const postJson = (path: string, body?: unknown) =>
    authFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const createPost = async (data: NewPost) => {
    const newPost = await parseOrThrow<PostType>(await postJson('/api/posts', data), 'Failed to create post');
    // DevBits have their own feed; the Home list holds regular posts only.
    if (newPost.kind !== 'devbit') setPosts(prevPosts => [newPost, ...prevPosts]);
    return newPost;
  };

  const likePost = async (postId: string) => {
    const updated = await parseOrThrow<PostType>(await postJson(`/api/posts/${postId}/like`), 'Failed to update like');
    replacePost(updated);
    return updated;
  };

  const savePost = async (postId: string) => {
    const updated = await parseOrThrow<PostType>(await postJson(`/api/posts/${postId}/save`), 'Failed to update save');
    replacePost(updated);
    return updated;
  };

  const addComment = async (postId: string, text: string) => {
    const newComment = await parseOrThrow<CommentType>(
      await postJson(`/api/posts/${postId}/comments`, { text }),
      'Failed to add comment'
    );
    setPosts(prevPosts =>
      prevPosts.map(post =>
        post._id === postId ? { ...post, comments: [...post.comments, newComment] } : post
      )
    );
    return newComment;
  };

  const deletePost = async (postId: string) => {
    const response = await authFetch(`/api/posts/${postId}`, { method: 'DELETE' });
    await parseOrThrow<{ message: string }>(response, 'Failed to delete post');
    setPosts(prevPosts => prevPosts.filter(post => post._id !== postId));
  };

  // Load once the stored session is restored, and again after login or logout.
  useEffect(() => {
    if (authLoading) return;
    fetchPosts();
  }, [authLoading, fetchPosts]);

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
