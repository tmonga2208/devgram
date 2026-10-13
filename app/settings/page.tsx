"use client"

import { useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { EditProfileForm } from "@/components/edit-profile-form"
import { AccountSettings } from "@/components/account-settings"
import { NotificationSettings } from "@/components/notification-settings"
import { PrivacySettings } from "@/components/privacy-settings"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger, scrollableTabsList } from "@/components/ui/tabs"
import { MainLayout } from "@/components/main-layout"
import { cn } from "@/lib/utils"
import { LogOut } from "lucide-react"

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const [activeTab, setActiveTab] = useState("profile")

  if (!user) {
    return null
  }

  return (
    <MainLayout>
      <div className="container max-w-4xl py-2 md:py-8">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={cn(scrollableTabsList, "md:grid md:grid-cols-4")}>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <EditProfileForm />
        </TabsContent>

        <TabsContent value="account" className="mt-6">
          <AccountSettings />
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <NotificationSettings />
        </TabsContent>

        <TabsContent value="privacy" className="mt-6">
          <PrivacySettings />
        </TabsContent>
      </Tabs>

      {/* From md up the top bar has the logout button. */}
      <Button variant="outline" className="mt-8 w-full md:hidden" onClick={logout}>
        <LogOut className="h-4 w-4" />
        Log out
      </Button>
    </div>
    </MainLayout>
  )
}
