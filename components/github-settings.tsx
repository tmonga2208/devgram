"use client"

import { useState } from "react"
import toast from "react-hot-toast"
import { GitHubMark } from "@/components/github-mark"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { connectHref } from "@/lib/github-links"

// Settings → Account: connect GitHub (it then shows on your profile and
// lists your repositories in Create), or see the connection and end it.
export function GitHubSettings() {
  const { user, disconnectGitHub } = useAuth()
  const [busy, setBusy] = useState(false)
  const login = user?.github?.login

  const disconnect = async () => {
    setBusy(true)
    try {
      await disconnectGitHub()
      toast.success("Disconnected GitHub")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect GitHub")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section data-github-settings className="mt-8 space-y-3 rounded-lg border p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <GitHubMark className="h-4 w-4" />
        GitHub
      </h2>
      {login ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 wrap-anywhere">
            Connected as{" "}
            <a href={`https://github.com/${login}`} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
              @{login}
            </a>
          </p>
          <Button type="button" variant="outline" onClick={disconnect} disabled={busy} className="min-h-11 md:min-h-9">
            Disconnect
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Show your GitHub on your profile and pick files from your repositories.</p>
          <Button asChild className="min-h-11 md:min-h-9">
            <a href={connectHref("/settings?tab=account")}>
              <GitHubMark className="h-4 w-4" />
              Connect GitHub
            </a>
          </Button>
        </>
      )}
    </section>
  )
}
