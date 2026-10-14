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
  muxVideo?: {
    assetId: string;
    playbackId: string;
    aspectRatio?: string;
    duration?: number;
  };
  caption: string;
  likes: number;
  comments: IComment[];
  createdAt: Date;
  updatedAt: Date;
  likedBy: string[];
  savedBy: string[];
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
    // A video uploaded to Mux (lib/mux.ts). `video` holds a pasted link instead.
    muxVideo: {
      type: new mongoose.Schema(
        {
          assetId: { type: String, required: true },
          playbackId: { type: String, required: true },
          aspectRatio: String,
          duration: Number,
        },
        { _id: false },
      ),
      required: false,
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
    savedBy: {
      type: [String],
      default: []
    },
  },
  {
    timestamps: true,
  }
);

postSchema.index({ 'author.username': 1 });
postSchema.index({ likes: 1, createdAt: -1 });
// One post per uploaded video, even when two requests race.
postSchema.index({ 'muxVideo.assetId': 1 }, { unique: true, sparse: true });

export default (mongoose.models.Post as mongoose.Model<IPost>) || mongoose.model<IPost>('Post', postSchema); 