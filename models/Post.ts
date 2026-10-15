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
  // A code post's files (lib/code-files.ts). Code posts from before files
  // have `code` instead.
  files?: { name: string; language: string; code: string }[];
  code?: string;
  // A code post's language: its first file's. Similar posts match on it.
  language?: string;
  // A regular post, or a DevBit (a short video with its own feed). Posts
  // stored before DevBits have no kind and are regular posts.
  kind?: 'post' | 'devbit';
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
    files: {
      type: [
        new mongoose.Schema(
          {
            name: { type: String, default: '' },
            language: { type: String, required: true },
            code: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      // Posts without code get no empty list.
      default: undefined,
    },
    code: {
      type: String,
    },
    language: {
      type: String,
    },
    kind: {
      type: String,
      enum: ['post', 'devbit'],
      default: 'post',
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
// The DevBits feed: newest DevBits first.
postSchema.index({ kind: 1, createdAt: -1 });

export default (mongoose.models.Post as mongoose.Model<IPost>) || mongoose.model<IPost>('Post', postSchema); 