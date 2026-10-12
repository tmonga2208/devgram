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
  code?: string
  language?: string
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
