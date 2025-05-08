import mongoose from 'mongoose';

export interface IComment {
  _id: mongoose.Types.ObjectId;
  username: string;
  avatar: string;
  text: string;
  likes: number;
  createdAt: Date;
}

export interface IPost extends mongoose.Document {
  author: {
    username: string;
    avatar: string;
  };
  image?: string;
  video?: string;
  code?: string;
  language?: string;
  caption: string;
  likes: number;
  comments: IComment[];
  createdAt: Date;
  updatedAt: Date;
  likedBy: string[];
  saved: boolean;
}

const commentSchema = new mongoose.Schema<IComment>(
  {
    username: {
      type: String,
      required: true,
    },
    avatar: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    likes: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const postSchema = new mongoose.Schema<IPost>(
  {
    author: {
      username: {
        type: String,
        required: true,
      },
      avatar: {
        type: String,
        required: true,
      },
    },
    image: {
      type: String,
    },
    video: {
      type: String,
    },
    code: {
      type: String,
    },
    language: {
      type: String,
    },
    caption: {
      type: String,
      required: true,
    },
    likes: {
      type: Number,
      default: 0,
    },
    comments: [commentSchema],
    likedBy: {
      type: [String],
      default: []
    },
    saved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

postSchema.index({ 'author.username': 1 });
postSchema.index({ likes: 1, createdAt: -1 });

export default mongoose.models.Post || mongoose.model<IPost>('Post', postSchema); 