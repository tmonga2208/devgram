"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Heart, MessageCircle, UserPlus, Bell } from "lucide-react"
import toast from "react-hot-toast"

interface Notification {
  _id: string
  type: 'like' | 'comment' | 'follow' | 'message' | 'mention'
  content: string
  postId?: string
  read: boolean
  createdAt: string
  user: {
    username: string
    avatar: string
  }
}

export function NotificationsPage() {
  const { token } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("all")

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!token) return
      
      try {
        const response = await fetch("/api/notifications", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        
        if (!response.ok) throw new Error("Failed to fetch notifications")
        
        const data = await response.json()
        setNotifications(data)
      } catch (error) {
        console.error("Error fetching notifications:", error)
        toast.error("Failed to load notifications")
      } finally {
        setLoading(false)
      }
    }

    fetchNotifications()
  }, [token])

  const markAsRead = async (notificationIds: string[]) => {
    if (!token || notificationIds.length === 0) return
    
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notificationIds }),
      })
      
      if (!response.ok) throw new Error("Failed to mark notifications as read")
      
      // Update local state
      setNotifications((prev) =>
        prev.map((notification) =>
          notificationIds.includes(notification._id)
            ? { ...notification, read: true }
            : notification
        )
      )
    } catch (error) {
      console.error("Error marking notifications as read:", error)
      toast.error("Failed to mark notifications as read")
    }
  }

  const markAllAsRead = () => {
    const unreadIds = notifications
      .filter((notification) => !notification.read)
      .map((notification) => notification._id)
    
    if (unreadIds.length > 0) {
      markAsRead(unreadIds)
    }
  }

  const filteredNotifications = notifications.filter((notification) => {
    if (activeTab === "all") return true
    return notification.type === activeTab
  })

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "like":
        return <Heart className="h-5 w-5 text-red-500" />
      case "comment":
        return <MessageCircle className="h-5 w-5 text-blue-500" />
      case "follow":
        return <UserPlus className="h-5 w-5 text-green-500" />
      case "message":
        return <MessageCircle className="h-5 w-5 text-purple-500" />
      default:
        return <Bell className="h-5 w-5 text-gray-500" />
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold">Notifications</h1>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-start gap-4 rounded-lg p-4">
              <div className="h-10 w-10 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {notifications.some((notification) => !notification.read) && (
          <Button variant="outline" size="sm" onClick={markAllAsRead}>
            Mark all as read
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="like">Likes</TabsTrigger>
          <TabsTrigger value="comment">Comments</TabsTrigger>
          <TabsTrigger value="follow">Follows</TabsTrigger>
          <TabsTrigger value="message">Messages</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-4">
        {filteredNotifications.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed">
            <p className="text-muted-foreground">No notifications</p>
          </div>
        ) : (
          filteredNotifications.map((notification) => (
            <div 
              key={notification._id} 
              className={`flex items-start gap-4 rounded-lg p-4 ${
                notification.read ? "bg-background" : "bg-muted/50"
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                {getNotificationIcon(notification.type)}
              </div>
              <div className="flex-1">
                <p>
                  <Link 
                    href={`/profile/${notification.user.username}`} 
                    className="font-medium hover:underline"
                  >
                    {notification.user.username}
                  </Link>{" "}
                  {notification.content}{" "}
                  {notification.postId && (
                    <Link 
                      href={`/p/${notification.postId}`} 
                      className="text-muted-foreground hover:underline"
                    >
                      View post
                    </Link>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                </p>
              </div>
              {!notification.read && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => markAsRead([notification._id])}
                >
                  <span className="sr-only">Mark as read</span>
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
