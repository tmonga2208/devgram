"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Home, Search, Compass, MessageSquare, Heart, PlusSquare, User, Settings } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const { user } = useAuth()

  return (
    <div className={cn("w-[240px] border-r px-3 py-6", className)}>
      <div className="flex flex-col gap-2">
        <Link href="/">
          <Button variant="ghost" className="w-full justify-start gap-2">
            <Home className="h-5 w-5" />
            <span>Home</span>
          </Button>
        </Link>
        <Link href="/search">
          <Button variant="ghost" className="w-full justify-start gap-2">
            <Search className="h-5 w-5" />
            <span>Search</span>
          </Button>
        </Link>
        <Link href="/explore">
          <Button variant="ghost" className="w-full justify-start gap-2">
            <Compass className="h-5 w-5" />
            <span>Explore</span>
          </Button>
        </Link>
        <Link href="/direct">
          <Button variant="ghost" className="w-full justify-start gap-2">
            <MessageSquare className="h-5 w-5" />
            <span>Messages</span>
          </Button>
        </Link>
        <Link href="/notifications">
          <Button variant="ghost" className="w-full justify-start gap-2">
            <Heart className="h-5 w-5" />
            <span>Notifications</span>
          </Button>
        </Link>
        <Link href="/create">
          <Button variant="ghost" className="w-full justify-start gap-2">
            <PlusSquare className="h-5 w-5" />
            <span>Create</span>
          </Button>
        </Link>
        <Link href={user ? `/profile/${user.username}` : "/login"}>
          <Button variant="ghost" className="w-full justify-start gap-2">
            <User className="h-5 w-5" />
            <span>Profile</span>
          </Button>
        </Link>
        <Link href="/settings">
          <Button variant="ghost" className="w-full justify-start gap-2">
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </Button>
        </Link>
      </div>
    </div>
  )
}
