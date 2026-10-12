import Notification from "@/models/Notification"
import User from "@/models/User"

export type NotificationType = "like" | "comment" | "follow" | "message" | "mention"

export async function createNotification(
  sender: string,
  recipient: string,
  type: NotificationType,
  content: string,
  postId?: string,
) {
  if (sender === recipient) return
  await Notification.create({ sender, recipient, type, content, postId, read: false })
}

// Notifies each existing user @mentioned in text, except the sender and anyone in exclude.
export async function notifyMentions(
  sender: string,
  text: string,
  content: string,
  postId: string,
  exclude: string[] = [],
) {
  const mentioned = [...new Set((text.match(/@(\w+)/g) || []).map((match) => match.slice(1)))].filter(
    (username) => username !== sender && !exclude.includes(username),
  )
  if (mentioned.length === 0) return

  const users = await User.find({ username: { $in: mentioned } }).select("username").lean()
  for (const user of users as Array<{ username: string }>) {
    await createNotification(sender, user.username, "mention", content, postId)
  }
}
