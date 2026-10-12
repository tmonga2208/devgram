"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { PrivacySettings as Settings } from "@/lib/types"
import toast from "react-hot-toast"

const DEFAULTS: Settings = {
  isPrivate: false,
  showActivityStatus: true,
  allowTagging: true,
  allowMessaging: true,
  showPosts: true,
  showStories: true,
}

const OPTIONS: Array<{ key: keyof Settings; label: string }> = [
  { key: "isPrivate", label: "Private Account" },
  { key: "showActivityStatus", label: "Show Activity Status" },
  { key: "allowTagging", label: "Allow Tagging" },
  { key: "allowMessaging", label: "Allow Messages" },
  { key: "showPosts", label: "Show Posts" },
  { key: "showStories", label: "Show Stories" },
]

export function PrivacySettings() {
  const { user, updateProfile } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULTS)

  // Load the saved values once they arrive from the server.
  const saved = user?.privacySettings
  useEffect(() => {
    if (saved) setSettings({ ...DEFAULTS, ...saved })
  }, [saved])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await updateProfile({ privacySettings: settings })
      toast.success("Privacy settings updated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update privacy settings")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="text-sm text-muted-foreground">
        These preferences are saved to your account. They are not enforced yet.
      </p>
      <div className="space-y-4">
        {OPTIONS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <Label htmlFor={`privacy-${key}`}>{label}</Label>
            <Switch
              id={`privacy-${key}`}
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
