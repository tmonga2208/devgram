"use client"

import { useEffect } from "react"

// Registers the service worker in production builds only, so local
// development never runs behind cached assets.
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return

    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error) => {
      console.error("Service worker registration failed:", error)
    })
  }, [])

  return null
}
