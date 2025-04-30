import mongoose from "mongoose"

export interface INotification extends mongoose.Document {
  recipient: string
  sender: string
  type: 'like' | 'comment' | 'follow' | 'message' | 'mention'
  content: string
  postId?: string
  read: boolean
  createdAt: Date
  updatedAt: Date
}

const notificationSchema = new mongoose.Schema<INotification>(
  {
    recipient: {
      type: String,
      required: true,
    },
    sender: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['like', 'comment', 'follow', 'message', 'mention'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    postId: {
      type: String,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
)

export default mongoose.models.Notification || mongoose.model<INotification>('Notification', notificationSchema) 