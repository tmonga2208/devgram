"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { Send } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/auth-context"
import toast from "react-hot-toast"

interface Message {
  _id: string
  sender: string
  receiver: string
  content: string
  createdAt: string
}

interface Conversation {
  username: string
  avatar: string
  lastMessage: {
    content: string
    timestamp: string
    sender: string
  }
}

export function DirectMessages() {
  const { user, token } = useAuth()
  const searchParams = useSearchParams()
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  // Get the user parameter from the URL
  const userParam = searchParams.get('user')

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const response = await fetch("/api/messages", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        if (!response.ok) throw new Error("Failed to fetch conversations")
        const data = await response.json()
        setConversations(data)
        
        // If there's a user parameter in the URL, set that as the active chat
        if (userParam) {
          // Check if a conversation with this user already exists
          const existingConversation = data.find(
            (conv: Conversation) => conv.username === userParam
          )
          
          if (existingConversation) {
            setActiveChat(userParam)
          } else {
            // If no conversation exists yet, create a placeholder conversation
            setActiveChat(userParam)
            // Add a placeholder conversation to the list
            setConversations((prev) => [
              {
                username: userParam,
                avatar: "/placeholder.svg",
                lastMessage: {
                  content: "No messages yet",
                  timestamp: new Date().toISOString(),
                  sender: userParam,
                },
              },
              ...prev,
            ])
          }
        } else if (data.length > 0 && !activeChat) {
          // If no user parameter and no active chat, set the first conversation as active
          setActiveChat(data[0].username)
        }
      } catch (err) {
        console.error("Error fetching conversations:", err)
        toast.error("Failed to load conversations")
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      fetchConversations()
    }
  }, [token, userParam])

  useEffect(() => {
    const fetchMessages = async () => {
      if (!activeChat || !token) return

      try {
        const response = await fetch(`/api/messages/${activeChat}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        if (!response.ok) throw new Error("Failed to fetch messages")
        const data = await response.json()
        setMessages(data)
      } catch (err) {
        console.error("Error fetching messages:", err)
        toast.error("Failed to load messages")
      }
    }

    fetchMessages()
  }, [activeChat, token])

  // Fetch user data for the user parameter if needed
  useEffect(() => {
    const fetchUserData = async () => {
      if (!userParam || !token) return;
      
      try {
        // Check if we already have this user in conversations
        const existingConversation = conversations.find(
          (conv) => conv.username === userParam
        );
        
        if (!existingConversation) {
          // Fetch user data
          const response = await fetch(`/api/users/${userParam}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          
          if (!response.ok) throw new Error("Failed to fetch user data");
          
          const userData = await response.json();
          
          // Update the placeholder conversation with real user data
          setConversations((prev) => 
            prev.map((conv) => 
              conv.username === userParam
                ? {
                    ...conv,
                    avatar: userData.avatar || "/placeholder.svg",
                  }
                : conv
            )
          );
        }
      } catch (err) {
        console.error("Error fetching user data:", err);
        toast.error("Failed to load user data");
      }
    };
    
    fetchUserData();
  }, [userParam, token, conversations]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || !activeChat || !token) return

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiver: activeChat,
          content: message,
        }),
      })

      if (!response.ok) throw new Error("Failed to send message")

      const newMessage = await response.json()
      setMessages((prev) => [...prev, newMessage])
      setMessage("")

      // Update conversations list with the new message
      setConversations((prev) =>
        prev.map((conv) =>
          conv.username === activeChat
            ? {
                ...conv,
                lastMessage: {
                  content: newMessage.content,
                  timestamp: newMessage.createdAt,
                  sender: newMessage.sender,
                },
              }
            : conv
        )
      )
    } catch (err) {
      console.error("Error sending message:", err)
      toast.error("Failed to send message")
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="grid h-[calc(100vh-4rem)] grid-cols-3 gap-4">
          <div className="col-span-1 border-r">
            <div className="animate-pulse space-y-4 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 rounded bg-muted" />
                    <div className="h-3 w-32 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="col-span-2">
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground">Select a conversation</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const activeConversation = conversations.find((conv) => conv.username === activeChat)

  return (
    <div className="mx-auto max-w-4xl">
      <div className="grid h-[calc(100vh-4rem)] grid-cols-3 gap-4">
        <div className="col-span-1 border-r">
          <div className="space-y-4 p-4">
            {conversations.map((conversation) => (
              <button
                key={conversation.username}
                onClick={() => setActiveChat(conversation.username)}
                className={`flex w-full items-center gap-4 rounded-lg p-4 transition-colors ${
                  activeChat === conversation.username
                    ? "bg-muted"
                    : "hover:bg-muted/50"
                }`}
              >
                <Avatar>
                  <AvatarImage
                    src={conversation.avatar || "/placeholder.svg"}
                    alt={conversation.username}
                  />
                  <AvatarFallback>
                    {conversation.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <p className="font-medium">{conversation.username}</p>
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {conversation.lastMessage.content}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(conversation.lastMessage.timestamp), {
                    addSuffix: true,
                  })}
                </p>
              </button>
            ))}
          </div>
        </div>

        {activeConversation ? (
          <div className="col-span-2 flex h-full flex-col">
            <div className="flex items-center gap-3 border-b p-4">
              <Link href={`/profile/${activeConversation.username}`}>
                <Avatar>
                  <AvatarImage
                    src={activeConversation.avatar || "/placeholder.svg"}
                    alt={activeConversation.username}
                  />
                  <AvatarFallback>
                    {activeConversation.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <div>
                <Link
                  href={`/profile/${activeConversation.username}`}
                  className="font-medium hover:underline"
                >
                  {activeConversation.username}
                </Link>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {messages.map((msg) => (
                <div
                  key={msg._id}
                  className={`mb-4 flex ${
                    msg.sender === user?.username ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-2 ${
                      msg.sender === user?.username
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <p>{msg.content}</p>
                    <p className="mt-1 text-right text-xs opacity-70">
                      {formatDistanceToNow(new Date(msg.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t p-4">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" size="icon" disabled={!message.trim()}>
                  <Send className="h-4 w-4" />
                  <span className="sr-only">Send</span>
                </Button>
              </form>
            </div>
          </div>
        ) : (
          <div className="col-span-2 flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground">
              <p>Select a conversation to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
