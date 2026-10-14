"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { DEVBITS_HEIGHT, DevBitsViewer } from "@/components/devbits/devbits-viewer"
import type { PostType } from "@/lib/types"

interface DevBitsScreenProps {
  // Open at this DevBit (/devbits/<id>).
  startId?: string
  // Only this person's DevBits, newest first (?user=).
  user?: string
}

type Status = "loading" | "ready" | "missing" | "error"

// What the DevBits screen shows: the shuffled feed, or one person's DevBits,
// opened at the linked DevBit. A link to a regular post goes to its page.
export function DevBitsScreen({ startId, user }: DevBitsScreenProps) {
  const { authFetch, loading: authLoading } = useAuth()
  const router = useRouter()
  const [devbits, setDevbits] = useState<PostType[]>([])
  const [startIndex, setStartIndex] = useState(0)
  const [status, setStatus] = useState<Status>("loading")
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // Wait for the stored session, so likes are the viewer's own.
    if (authLoading) return
    let cancelled = false

    const load = async () => {
      setStatus("loading")
      try {
        let start: PostType | null = null
        if (startId) {
          const response = await authFetch(`/api/posts/${startId}`)
          if (cancelled) return
          if (response.status === 404) return setStatus("missing")
          if (!response.ok) throw new Error("Failed to load the DevBit")
          start = (await response.json()) as PostType
          if (start.kind !== "devbit") return router.replace(`/p/${startId}`)
        }
        const response = await authFetch(user ? `/api/devbits?user=${encodeURIComponent(user)}` : "/api/devbits")
        if (!response.ok) throw new Error("Failed to load DevBits")
        const list = (await response.json()) as PostType[]
        if (cancelled) return

        const first = start
        if (!first) {
          setDevbits(list)
          setStartIndex(0)
        } else if (user) {
          const index = list.findIndex((devbit) => devbit._id === first._id)
          setDevbits(index >= 0 ? list : [first, ...list])
          setStartIndex(Math.max(index, 0))
        } else {
          setDevbits([first, ...list.filter((devbit) => devbit._id !== first._id)])
          setStartIndex(0)
        }
        setStatus("ready")
      } catch {
        if (!cancelled) setStatus("error")
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [authFetch, authLoading, startId, user, router, attempt])

  if (status === "loading") return <div className={`animate-pulse bg-black md:rounded-lg ${DEVBITS_HEIGHT}`} />
  if (status === "error") {
    return (
      <Message text="Couldn't load DevBits">
        <Button variant="secondary" onClick={() => setAttempt((count) => count + 1)}>
          Try again
        </Button>
      </Message>
    )
  }
  if (status === "missing") {
    return (
      <Message text="This DevBit doesn't exist or was removed.">
        <Button asChild variant="secondary">
          <Link href="/devbits">See other DevBits</Link>
        </Button>
      </Message>
    )
  }
  if (devbits.length === 0) {
    return (
      <Message text="No DevBits yet">
        <Button asChild variant="secondary">
          <Link href="/create?tab=devbit">Post a DevBit</Link>
        </Button>
      </Message>
    )
  }
  return <DevBitsViewer devbits={devbits} startIndex={startIndex} />
}

function Message({ text, children }: { text: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 bg-black p-6 text-center text-white md:rounded-lg ${DEVBITS_HEIGHT}`}>
      <p>{text}</p>
      {children}
    </div>
  )
}
