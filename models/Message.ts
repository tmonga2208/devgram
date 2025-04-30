import mongoose from "mongoose"

export interface IMessage extends mongoose.Document {
  sender: string
  receiver: string
  content: string
  createdAt: Date
  updatedAt: Date
}

const messageSchema = new mongoose.Schema<IMessage>(
  {
    sender: {
      type: String,
      required: true,
    },
    receiver: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
)

export default mongoose.models.Message || mongoose.model<IMessage>('Message', messageSchema) 