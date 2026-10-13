import type React from "react"
import { cn } from "@/lib/utils"
import { MobileTabBar } from "@/components/mobile-tab-bar"
import { Navbar } from "@/components/navbar"
import { Sidebar } from "@/components/sidebar"

interface MainLayoutProps {
  children: React.ReactNode
  // On phones the page fills the space between the top bar and the tab bar
  // itself, instead of getting the usual page margins.
  fill?: boolean
}

export function MainLayout({ children, fill = false }: MainLayoutProps) {
  return (
    <div className="min-h-dvh bg-background">
      <Navbar />
      <div
        className={cn(
          "container mx-auto flex gap-6 md:gap-10 md:pl-(--safe-left) md:pr-(--safe-right) md:pt-16",
          fill ? "pl-(--safe-left) pr-(--safe-right)" : "pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))]",
        )}
      >
        <Sidebar className="hidden md:block" />
        <main
          className={cn(
            "min-w-0 flex-1 md:pt-6 md:pb-6",
            fill ? "pb-(--tab-bar-height)" : "pt-4 pb-[calc(var(--tab-bar-height)+1rem)]",
          )}
        >
          {children}
        </main>
      </div>
      <MobileTabBar />
    </div>
  )
}
