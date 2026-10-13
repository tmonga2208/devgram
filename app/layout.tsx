import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { PwaRegister } from "@/components/pwa-register"
import { AuthProvider } from "@/contexts/auth-context"
import { PostsProvider } from "@/contexts/posts-context"
import { Toaster } from "react-hot-toast"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "DevGram",
  description: "Instagram for Developers",
  applicationName: "DevGram",
  appleWebApp: {
    capable: true,
    title: "DevGram",
    statusBarStyle: "default",
  },
}

export const viewport: Viewport = {
  themeColor: "#18181b",
  // Lets the page reach the screen edges on phones; the bars pad themselves
  // back in with the safe-area insets.
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <PostsProvider>
              {children}
              {/* On phones toasts sit above the tab bar instead of covering it. */}
              <Toaster
                position="bottom-right"
                containerClassName="max-md:bottom-[calc(var(--tab-bar-height)+0.5rem)]!"
              />
            </PostsProvider>
          </AuthProvider>
        </ThemeProvider>
        <PwaRegister />
      </body>
    </html>
  )
}
