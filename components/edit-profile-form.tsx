"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/contexts/auth-context"
import { AvatarUpload } from "@/components/avatar-upload"
import toast from "react-hot-toast"

export function EditProfileForm() {
  const { user, updateProfile } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({ fullName: "", website: "", bio: "", avatar: "" })

  const fullName = user?.fullName || ""
  const website = user?.website || ""
  const bio = user?.bio || ""
  // The placeholder is the "no avatar" state, so it is shown as an empty field.
  const avatar = user?.avatar && user.avatar !== "/placeholder.svg" ? user.avatar : ""

  // Load saved values, including ones that arrive after the session refresh.
  useEffect(() => {
    setFormData({ fullName, website, bio, avatar })
  }, [fullName, website, bio, avatar])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      await updateProfile(formData)
      toast.success("Profile updated successfully!")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update profile")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!user) {
    return null
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
          <CardDescription>Update your profile information</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-24 w-24 overflow-hidden rounded-full">
                {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, any host */}
                <img
                  src={formData.avatar || "/placeholder.svg"}
                  alt={user.username}
                  className="h-full w-full object-cover"
                />
              </div>
              <p className="text-sm font-medium">{user.username}</p>
              <AvatarUpload onUploaded={(url) => setFormData((prev) => ({ ...prev, avatar: url }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="avatar">Profile picture URL</Label>
              <Input
                id="avatar"
                name="avatar"
                type="url"
                value={formData.avatar}
                onChange={handleChange}
                placeholder="https://example.com/avatar.jpg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Name</Label>
              <Input id="fullName" name="fullName" value={formData.fullName} onChange={handleChange} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={user.username} disabled />
              <p className="text-xs text-muted-foreground">Usernames cannot be changed.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                name="website"
                type="url"
                value={formData.website}
                onChange={handleChange}
                placeholder="https://example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" name="bio" value={formData.bio} onChange={handleChange} rows={4} maxLength={500} />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Saving..." : "Save Profile"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
