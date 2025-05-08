"use client"

import { useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"

export function PrivacySettings() {
  const { updateProfile } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [settings, setSettings] = useState({
    privateAccount: false,
    showActivityStatus: true,
    allowTagging: true,
    allowMessages: true,
    postVisibility: "public",
    storyVisibility: "public",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await updateProfile({
        privacySettings: settings,
      })

      toast.success("Privacy settings updated")
    } catch (error) {
      toast.error("Failed to update privacy settings")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="privateAccount">Private Account</Label>
          <Switch
            id="privateAccount"
            checked={settings.privateAccount}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, privateAccount: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="showActivityStatus">Show Activity Status</Label>
          <Switch
            id="showActivityStatus"
            checked={settings.showActivityStatus}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, showActivityStatus: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="allowTagging">Allow Tagging</Label>
          <Switch
            id="allowTagging"
            checked={settings.allowTagging}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, allowTagging: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="allowMessages">Allow Messages</Label>
          <Switch
            id="allowMessages"
            checked={settings.allowMessages}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, allowMessages: checked })
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="postVisibility">Post Visibility</Label>
          <Select
            value={settings.postVisibility}
            onValueChange={(value) =>
              setSettings({ ...settings, postVisibility: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select visibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="followers">Followers</SelectItem>
              <SelectItem value="private">Private</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="storyVisibility">Story Visibility</Label>
          <Select
            value={settings.storyVisibility}
            onValueChange={(value) =>
              setSettings({ ...settings, storyVisibility: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select visibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="followers">Followers</SelectItem>
              <SelectItem value="closeFriends">Close Friends</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  )
} 