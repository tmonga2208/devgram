"use client"

import { useEffect, useState } from "react"
import { useAuth, type ProfileUpdate } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import toast from "react-hot-toast"

export function AccountSettings() {
  const { user, updateProfile } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  const savedEmail = user?.email || ""
  useEffect(() => {
    setFormData((prev) => ({ ...prev, email: savedEmail }))
  }, [savedEmail])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const update: ProfileUpdate = {}
    if (formData.email !== savedEmail) update.email = formData.email

    if (formData.newPassword) {
      if (formData.newPassword !== formData.confirmPassword) {
        toast.error("New passwords don't match")
        return
      }
      if (!formData.currentPassword) {
        toast.error("Current password is required")
        return
      }
      update.currentPassword = formData.currentPassword
      update.newPassword = formData.newPassword
    }

    if (Object.keys(update).length === 0) {
      toast("Nothing to update")
      return
    }

    setIsLoading(true)
    try {
      await updateProfile(update)
      toast.success("Account settings updated")
      setFormData((prev) => ({ ...prev, currentPassword: "", newPassword: "", confirmPassword: "" }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update account settings")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
        </div>

        <div>
          <Label htmlFor="currentPassword">Current Password</Label>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={formData.currentPassword}
            onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="newPassword">New Password</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={formData.newPassword}
            onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="confirmPassword">Confirm New Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          />
        </div>
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  )
}
