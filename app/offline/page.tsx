import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Offline | DevGram",
}

// Shown by the service worker when a page cannot be loaded. It is served at
// whatever address the visitor asked for, so "Try again" reloads that address.
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">You&apos;re offline</h1>
      <p className="max-w-sm text-muted-foreground">
        DevGram can&apos;t reach the network right now. Check your connection and try again.
      </p>
      <a
        href=""
        className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Try again
      </a>
    </div>
  )
}
