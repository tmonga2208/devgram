import type React from "react"
import { Navbar } from "@/components/navbar"
import { Sidebar } from "@/components/sidebar"

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto flex gap-6 pt-16 md:gap-10">
        <Sidebar className="hidden md:block" />
        <main className="flex-1 py-6">{children}</main>
      </div>
    </div>
  )
}
