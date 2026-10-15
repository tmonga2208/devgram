"use client"

import { useCallback, useSyncExternalStore } from "react"

// Whether a CSS media query matches. False while rendering on the server,
// then the browser's answer, kept up to date.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
