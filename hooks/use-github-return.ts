"use client"

import { useEffect } from "react"
import toast from "react-hot-toast"
import { githubReturnMessage } from "@/lib/github-links"

// After GitHub sends someone back (?github=…), says how connecting went, once,
// and takes the note out of the address.
export function useGitHubReturn() {
  useEffect(() => {
    const url = new URL(window.location.href)
    const result = url.searchParams.get("github")
    if (!result) return
    const message = githubReturnMessage(result, url.searchParams.get("github_login"))
    url.searchParams.delete("github")
    url.searchParams.delete("github_login")
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
    if (message) (message.kind === "success" ? toast.success : toast.error)(message.text)
  }, [])
}
