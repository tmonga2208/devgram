import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends mongoose.Document {
  username: string;
  email: string;
  password: string;
  fullName: string;
  avatar?: string;
  bio?: string;
  website?: string;
  followers: number;
  following: mongoose.Types.ObjectId[];
  followingCount: number;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  isVerified: boolean;
  twoFactorEnabled: boolean;
  notificationSettings: {
    email: boolean;
    push: boolean;
    followers: boolean;
    comments: boolean;
    likes: boolean;
    mentions: boolean;
    marketing: boolean;
  };
  privacySettings: {
    isPrivate: boolean;
    showActivityStatus: boolean;
    allowTagging: boolean;
    allowMessaging: boolean;
    showPosts: boolean;
    showStories: boolean;
  };
}

const userSchema = new mongoose.Schema<IUser>(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters long'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters long'],
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    avatar: {
      type: String,
      default: '/placeholder.svg?height=150&width=150',
    },
    bio: {
      type: String,
      default: '',
    },
    website: {
      type: String,
      default: '',
    },
    followers: {
      type: Number,
      default: 0,
    },
    following: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    followingCount: {
      type: Number,
      default: 0,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    notificationSettings: {
      email: {
        type: Boolean,
        default: true,
      },
      push: {
        type: Boolean,
        default: true,
      },
      followers: {
        type: Boolean,
        default: true,
      },
      comments: {
        type: Boolean,
        default: true,
      },
      likes: {
        type: Boolean,
        default: true,
      },
      mentions: {
        type: Boolean,
        default: true,
      },
      marketing: {
        type: Boolean,
        default: false,
      },
    },
    privacySettings: {
      isPrivate: {
        type: Boolean,
        default: false,
      },
      showActivityStatus: {
        type: Boolean,
        default: true,
      },
      allowTagging: {
        type: Boolean,
        default: true,
      },
      allowMessaging: {
        type: Boolean,
        default: true,
      },
      showPosts: {
        type: Boolean,
        default: true,
      },
      showStories: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ fullName: 1 });
userSchema.index({ followers: 1, followingCount: 1 });

export default mongoose.models.User || mongoose.model<IUser>('User', userSchema); 