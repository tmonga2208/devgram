export interface UserType {
  username: string
  fullName: string
  avatar: string
  bio: string
  website?: string
  followers: number
  following: number
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
  author: {
    username: string
    avatar: string
  }
  image?: string
  code?: string
  language?: string
  caption: string
  likes: number
  comments: Array<{
    _id: string
    username: string
    avatar: string
    text: string
    likes: number
    createdAt: string
  }>
  createdAt: string
  liked: boolean
  saved: boolean
}
