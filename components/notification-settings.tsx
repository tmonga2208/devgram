"use client"

import { useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"

export function NotificationSettings() {
  const { user, updateProfile } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [settings, setSettings] = useState({
    emailNotifications: true,
    pushNotifications: true,
    newFollowerNotification: true,
    newCommentNotification: true,
    newLikeNotification: true,
    newMentionNotification: true,
    marketingEmails: false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await updateProfile({
        notificationSettings: settings,
      })

      toast.success("Notification settings updated")
    } catch (error) {
      toast.error("Failed to update notification settings")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="emailNotifications">Email Notifications</Label>
          <Switch
            id="emailNotifications"
            checked={settings.emailNotifications}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, emailNotifications: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="pushNotifications">Push Notifications</Label>
          <Switch
            id="pushNotifications"
            checked={settings.pushNotifications}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, pushNotifications: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="newFollowerNotification">New Follower Notifications</Label>
          <Switch
            id="newFollowerNotification"
            checked={settings.newFollowerNotification}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, newFollowerNotification: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="newCommentNotification">New Comment Notifications</Label>
          <Switch
            id="newCommentNotification"
            checked={settings.newCommentNotification}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, newCommentNotification: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="newLikeNotification">New Like Notifications</Label>
          <Switch
            id="newLikeNotification"
            checked={settings.newLikeNotification}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, newLikeNotification: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="newMentionNotification">New Mention Notifications</Label>
          <Switch
            id="newMentionNotification"
            checked={settings.newMentionNotification}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, newMentionNotification: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="marketingEmails">Marketing Emails</Label>
          <Switch
            id="marketingEmails"
            checked={settings.marketingEmails}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, marketingEmails: checked })
            }
          />
        </div>
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  )
} 