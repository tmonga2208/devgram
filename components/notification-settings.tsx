"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { NotificationSettings as Settings } from "@/lib/types"
import toast from "react-hot-toast"

const DEFAULTS: Settings = {
  email: true,
  push: true,
  followers: true,
  comments: true,
  likes: true,
  mentions: true,
  marketing: false,
}

const OPTIONS: Array<{ key: keyof Settings; label: string }> = [
  { key: "email", label: "Email Notifications" },
  { key: "push", label: "Push Notifications" },
  { key: "followers", label: "New Follower Notifications" },
  { key: "comments", label: "New Comment Notifications" },
  { key: "likes", label: "New Like Notifications" },
  { key: "mentions", label: "New Mention Notifications" },
  { key: "marketing", label: "Marketing Emails" },
]

export function NotificationSettings() {
  const { user, updateProfile } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULTS)

  // Load the saved values once they arrive from the server.
  const saved = user?.notificationSettings
  useEffect(() => {
    if (saved) setSettings({ ...DEFAULTS, ...saved })
  }, [saved])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await updateProfile({ notificationSettings: settings })
      toast.success("Notification settings updated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update notification settings")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        {OPTIONS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <Label htmlFor={`notification-${key}`}>{label}</Label>
            <Switch
              id={`notification-${key}`}
              checked={settings[key]}
              onCheckedChange={(checked) => setSettings({ ...settings, [key]: checked })}
            />
          </div>
        ))}
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  )
}
