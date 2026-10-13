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
              <Toaster position="bottom-right" />
            </PostsProvider>
          </AuthProvider>
        </ThemeProvider>
        <PwaRegister />
      </body>
    </html>
  )
}
