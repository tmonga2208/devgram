import type { CodeFile } from "@/lib/code-files"

export interface NotificationSettings {
  email: boolean
  push: boolean
  followers: boolean
  comments: boolean
  likes: boolean
  mentions: boolean
  marketing: boolean
}

export interface PrivacySettings {
  isPrivate: boolean
  showActivityStatus: boolean
  allowTagging: boolean
  allowMessaging: boolean
  showPosts: boolean
  showStories: boolean
}

// A public profile, as returned by GET /api/users/[username]
export interface UserType {
  _id: string
  username: string
  fullName: string
  avatar: string
  bio: string
  website: string
  followers: number
  following: number
  isVerified: boolean
  isFollowing: boolean
}

export interface CommentType {
  _id: string
  username: string
  avatar: string
  text: string
  likes: number
  createdAt: string
}

export interface PostType {
  _id: string
  caption: string
  image?: string
  video?: string
  // A code post's files. Code posts from before files have `code` and
  // `language` instead; postFiles() reads either.
  files?: CodeFile[]
  code?: string
  language?: string
  kind?: "post" | "devbit"
  muxVideo?: {
    assetId: string
    playbackId: string
    aspectRatio?: string
    duration?: number
  }
  author: {
    username: string
    avatar: string
  }
  likes: number
  comments: CommentType[]
  likedBy: string[]
  savedBy: string[]
  createdAt: string
  updatedAt: string
}
