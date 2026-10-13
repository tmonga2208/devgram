"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ArrowLeft, PlusSquare, Heart, LogOut, MessageSquare } from "lucide-react"
import { mobileTabs } from "@/components/mobile-tab-bar"
import { useAuth } from "@/contexts/auth-context"
import { Search } from "@/components/search"

export function Navbar() {
  const { user, loading, logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  // On phones, pages without a tab get a back arrow. Whether a profile is the
  // viewer's own tab is only known once the stored session has been read.
  const onMainTab = mobileTabs(user?.username).some((tab) => tab.href === pathname)
  const showBack = !onMainTab && !(loading && pathname.startsWith("/profile/"))

  const goBack = () => {
    // An installed app has no browser back button, and a page opened from a
    // link has nothing to go back to, so that case goes home instead.
    const navigation = (window as Window & { navigation?: { canGoBack: boolean } }).navigation
    const canGoBack = navigation ? navigation.canGoBack : window.history.length > 1
    if (canGoBack) router.back()
    else router.push("/")
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 pl-(--safe-left) pr-(--safe-right) pt-(--safe-top) backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center px-4 md:px-0">
        {showBack && (
          <Button
            variant="ghost"
            size="icon"
            className="-ml-3 mr-1 size-11 shrink-0 md:hidden"
            onClick={goBack}
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="mr-4 hidden md:flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <span className="hidden font-bold sm:inline-block">DevGram</span>
          </Link>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-between">
          <div className="w-full max-w-md">
            <Search />
          </div>

          <nav className="hidden items-center space-x-2 md:flex">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/create">
                <PlusSquare className="h-5 w-5" />
                <span className="sr-only">Create</span>
              </Link>
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link href="/notifications">
                <Heart className="h-5 w-5" />
                <span className="sr-only">Notifications</span>
              </Link>
            </Button>
            <Link href={user ? `/profile/${user.username}` : "/login"}>
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatar || "/placeholder.svg"} alt={user?.username || "User"} />
                <AvatarFallback>{user?.username?.slice(0, 2).toUpperCase() || "U"}</AvatarFallback>
              </Avatar>
            </Link>
            {user && (
              <Button variant="ghost" size="icon" onClick={logout} title="Logout">
                <LogOut className="h-5 w-5" />
                <span className="sr-only">Logout</span>
              </Button>
            )}
          </nav>
          {/* Phones get the rest of the navigation from the bottom tab bar. */}
          <div className="-mr-3 ml-1 flex shrink-0 items-center md:hidden">
            <Button variant="ghost" size="icon" className="size-11" asChild>
              <Link href="/notifications">
                <Heart className="h-5 w-5" />
                <span className="sr-only">Notifications</span>
              </Link>
            </Button>
            <Button variant="ghost" size="icon" className="size-11" asChild>
              <Link href="/direct">
                <MessageSquare className="h-5 w-5" />
                <span className="sr-only">Messages</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
