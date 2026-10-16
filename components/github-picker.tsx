"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { ArrowLeft, File, Folder } from "lucide-react"
import { GitHubMark } from "@/components/github-mark"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/auth-context"
import type { GitHubSource, MarkedLines } from "@/lib/code-files"
import {
  FOLDER_NOT_FOUND,
  UNREACHABLE,
  entriesInFolder,
  matchFiles,
  parentFolder,
  type GitHubFileResponse,
  type GitHubRepo,
  type ResolvedLink,
  type TreeEntry,
} from "@/lib/github-links"

// A file chosen in the picker, ready to become a tab in the Code tab.
export interface PickedFile {
  name: string
  language: string
  code: string
  github: GitHubSource
  marked: MarkedLines | null
}

interface GitHubPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (file: PickedFile) => void
  // Leaves for GitHub to connect, keeping the post as it is.
  onConnect: () => void
}

// The repository being browsed: every entry at one commit, and the folder open.
interface Browsing {
  owner: string
  repo: string
  commit: string
  entries: TreeEntry[]
  folder: string
}

const row = "flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-1 text-left text-sm hover:bg-muted disabled:opacity-50 md:min-h-9"
// The whole screen on phones; a dialog in the middle of the window from 640px.
const layout =
  "top-0 left-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-4 overflow-hidden rounded-none border-0 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:top-[50%] sm:left-[50%] sm:h-[min(40rem,85vh)] sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border"

// Create's From GitHub: paste a link to any public repository, folder or
// file, or open one of your repositories and choose a file.
export function GitHubPicker({ open, onOpenChange, onPick, onConnect }: GitHubPickerProps) {
  const { user, authFetch } = useAuth()
  const connected = Boolean(user?.github)
  const [link, setLink] = useState("")
  const [repos, setRepos] = useState<GitHubRepo[] | null>(null)
  const [repoFilter, setRepoFilter] = useState("")
  const [browsing, setBrowsing] = useState<Browsing | null>(null)
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  // An answer from one of the GitHub routes; throws the server's message.
  const getJson = useCallback(
    async <T,>(path: string): Promise<T> => {
      const response = await authFetch(path)
      const data = await response.json().catch(() => null)
      if (!response.ok || data === null) throw new Error(data?.error || UNREACHABLE)
      return data as T
    },
    [authFetch],
  )

  // Each time the picker opens: back to the start, with your repositories fresh.
  useEffect(() => {
    if (!open) return
    setBrowsing(null)
    setQuery("")
    setLink("")
    setRepoFilter("")
    setError("")
    if (!connected) return
    let cancelled = false
    setRepos(null)
    getJson<GitHubRepo[]>("/api/github/repos")
      .then((list) => {
        if (!cancelled) setRepos(list)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setRepos([])
        setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [open, connected, getJson])

  // Runs one step, with "Loading…" meanwhile and its error if it fails.
  const step = async (work: () => Promise<void>) => {
    setBusy(true)
    setError("")
    try {
      await work()
    } catch (err) {
      setError(err instanceof Error ? err.message : UNREACHABLE)
    } finally {
      setBusy(false)
    }
  }

  const browse = async (owner: string, repo: string, commit: string, folder: string) => {
    const { entries } = await getJson<{ entries: TreeEntry[] }>(`/api/github/tree?${new URLSearchParams({ owner, repo, commit })}`)
    if (folder && !entries.some((entry) => entry.type === "folder" && entry.path === folder)) throw new Error(FOLDER_NOT_FOUND)
    setBrowsing({ owner, repo, commit, entries, folder })
    setQuery("")
  }

  // Marks from a link that don't fit the file are dropped rather than refused.
  const pick = async (source: GitHubSource, marked: MarkedLines | null) => {
    const file = await getJson<GitHubFileResponse>(`/api/github/file?${new URLSearchParams({ ...source })}`)
    onPick({
      name: file.name,
      language: file.language,
      code: file.code,
      github: file.github,
      marked: marked && marked.to <= file.lineCount ? marked : null,
    })
    onOpenChange(false)
  }

  const openLink = (url: string) =>
    step(async () => {
      const found = await getJson<ResolvedLink>(`/api/github/resolve?${new URLSearchParams({ url })}`)
      if (found.kind === "file") await pick({ owner: found.owner, repo: found.repo, commit: found.commit, path: found.path }, found.marked)
      else await browse(found.owner, found.repo, found.commit, found.path)
    })

  const submitLink = (event: FormEvent) => {
    event.preventDefault()
    if (link.trim()) openLink(link.trim())
  }

  const shown = browsing ? (query.trim() ? matchFiles(browsing.entries, query) : entriesInFolder(browsing.entries, browsing.folder)) : []
  const needle = repoFilter.trim().toLowerCase()
  const listedRepos = (repos ?? []).filter((repo) => repo.name.toLowerCase().includes(needle))
  const crumbs = browsing?.folder ? browsing.folder.split("/") : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-github-picker className={layout}>
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="flex items-center gap-2">
            <GitHubMark className="h-5 w-5" />
            From GitHub
          </DialogTitle>
          <DialogDescription>Public repositories only. A file is shared as it is at its commit.</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {browsing ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Back"
                className="size-11 shrink-0 md:size-9"
                onClick={() => (browsing.folder ? setBrowsing({ ...browsing, folder: parentFolder(browsing.folder) }) : setBrowsing(null))}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <nav
                aria-label="Path"
                className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <button type="button" className="min-h-11 shrink-0 font-medium hover:underline md:min-h-9" onClick={() => setBrowsing({ ...browsing, folder: "" })}>
                  {browsing.repo}
                </button>
                {crumbs.map((part, index) => (
                  <span key={index} className="flex shrink-0 items-center gap-1">
                    <span className="text-muted-foreground">/</span>
                    <button
                      type="button"
                      className="min-h-11 hover:underline md:min-h-9"
                      onClick={() => setBrowsing({ ...browsing, folder: crumbs.slice(0, index + 1).join("/") })}
                    >
                      {part}
                    </button>
                  </span>
                ))}
              </nav>
            </div>
            <Input
              aria-label="Find a file"
              placeholder="Find a file"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="min-h-11 md:min-h-9"
            />
            <ul data-github-entries className="min-h-0 flex-1 overflow-y-auto">
              {shown.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    data-github-entry={entry.path}
                    disabled={busy}
                    className={row}
                    onClick={() =>
                      entry.type === "folder"
                        ? setBrowsing({ ...browsing, folder: entry.path })
                        : step(() => pick({ owner: browsing.owner, repo: browsing.repo, commit: browsing.commit, path: entry.path }, null))
                    }
                  >
                    {entry.type === "folder" ? (
                      <Folder className="h-4 w-4 shrink-0 text-sky-500" />
                    ) : (
                      <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{query.trim() ? entry.path : entry.path.slice(entry.path.lastIndexOf("/") + 1)}</span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">{query.trim() ? "No matching files" : "This folder is empty"}</li>
              )}
            </ul>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <form onSubmit={submitLink} className="flex gap-2">
              <Input
                data-github-link-input
                aria-label="Paste a GitHub link"
                placeholder="Paste a GitHub link"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="min-h-11 md:min-h-9"
              />
              <Button type="submit" disabled={busy || !link.trim()} className="min-h-11 shrink-0 md:min-h-9">
                Open
              </Button>
            </form>
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <p className="text-sm font-medium">Your repositories</p>
              {!connected ? (
                <Button type="button" variant="outline" onClick={onConnect} className="min-h-11 md:min-h-9">
                  <GitHubMark className="h-4 w-4" />
                  Connect GitHub
                </Button>
              ) : repos === null ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <>
                  <Input
                    aria-label="Filter your repositories"
                    placeholder="Filter your repositories"
                    value={repoFilter}
                    onChange={(event) => setRepoFilter(event.target.value)}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="min-h-11 md:min-h-9"
                  />
                  <ul className="min-h-0 flex-1 overflow-y-auto">
                    {listedRepos.map((repo) => (
                      <li key={`${repo.owner}/${repo.name}`}>
                        <button
                          type="button"
                          data-github-repo={repo.name}
                          disabled={busy}
                          className={row}
                          onClick={() => openLink(`https://github.com/${repo.owner}/${repo.name}`)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{repo.name}</span>
                            {repo.description && <span className="block truncate text-xs text-muted-foreground">{repo.description}</span>}
                          </span>
                          {repo.language && <span className="shrink-0 text-xs text-muted-foreground">{repo.language}</span>}
                        </button>
                      </li>
                    ))}
                    {listedRepos.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No repositories</li>}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
        {busy && <p className="text-sm text-muted-foreground">Loading…</p>}
      </DialogContent>
    </Dialog>
  )
}
