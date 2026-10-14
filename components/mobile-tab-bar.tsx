"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Clapperboard, Compass, Home, PlusSquare, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"

// The pages that have a tab on phones. Every other page shows a back arrow
// in the top bar instead.
export function mobileTabs(username?: string) {
  return [
    { label: "Home", href: "/", icon: Home },
    { label: "Explore", href: "/explore", icon: Compass },
    { label: "Create", href: "/create", icon: PlusSquare },
    { label: "DevBits", href: "/devbits", icon: Clapperboard },
    { label: "Profile", href: username ? `/profile/${username}` : "/login", icon: User },
  ]
}

export function MobileTabBar() {
  const pathname = usePathname()
  const { user } = useAuth()

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 h-(--tab-bar-height) border-t bg-background/95 pb-(--safe-bottom) pl-(--safe-left) pr-(--safe-right) backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden"
    >
      <ul className="flex h-full">
        {mobileTabs(user?.username).map(({ label, href, icon: Icon }) => {
          const current = pathname === href
          return (
            <li key={label} className="flex-1">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  current ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="h-6 w-6" strokeWidth={current ? 2.5 : 2} />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
