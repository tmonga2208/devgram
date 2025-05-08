export interface UserType {
  username: string
  fullName: string
  avatar: string
  bio: string
  website?: string
  followers: number
  following: number
  isVerified: boolean
  twoFactorEnabled: boolean
  notificationSettings: {
    email: boolean
    push: boolean
    followers: boolean
    comments: boolean
    likes: boolean
    mentions: boolean
    marketing: boolean
  }
  privacySettings: {
    isPrivate: boolean
    showActivityStatus: boolean
    allowTagging: boolean
    allowMessaging: boolean
    showPosts: boolean
    showStories: boolean
  }
}

export interface CommentType {
  username: string
  avatar: string
  text: string
  likes: number
  createdAt: string
}

export interface PostType {
  _id: string
  content: string
  image?: string
  video?: string
  code?: string
  language?: string
  caption?: string
  author: {
    username: string
    avatar: string
    verified?: boolean
  }
  likes: number
  comments: CommentType[]
  likedBy: string[]
  saved: boolean
  createdAt: string
  updatedAt: string
}
