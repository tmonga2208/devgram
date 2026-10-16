"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Clapperboard, Code, ImageIcon, VideoIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger, scrollableTabsList } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CodeFilesEditor, newDraftFile, type DraftFile } from "@/components/code-files-editor"
import { parseFiles } from "@/lib/code-files"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { usePosts } from "@/contexts/posts-context"
import { MediaPicker } from "@/components/media-picker"
import { usePhotoUpload } from "@/hooks/use-photo-upload"
import { useVideoUpload } from "@/hooks/use-video-upload"
import type { NewPost } from "@/contexts/posts-context"
import { UPLOAD_FAILED } from "@/lib/upload-client"
import { DEVBIT_LENGTH } from "@/lib/media-rules"
import toast from "react-hot-toast"
import { useGitHubReturn } from "@/hooks/use-github-return"
import { saveDraft, takeDraft } from "@/lib/code-draft"
import { connectHref } from "@/lib/github-links"

const TABS = ["image", "video", "code", "devbit"]

// initialTab opens a tab other than Image, as /create?tab=devbit does.
export function CreatePostForm({ initialTab }: { initialTab?: string }) {
  const router = useRouter()
  const { createPost } = usePosts()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState(initialTab && TABS.includes(initialTab) ? initialTab : "image")
  const [caption, setCaption] = useState("")
  const [files, setFiles] = useState<DraftFile[]>(() => [newDraftFile()])
  useGitHubReturn()
  // Back from connecting GitHub: the Code tab's post comes back as it was.
  useEffect(() => {
    if (initialTab !== "code") return
    const draft = takeDraft()
    if (!draft) return
    setCaption(draft.caption)
    setFiles(draft.files.map((file) => newDraftFile(file.language, file)))
  }, [initialTab])
  const connectGitHub = () => {
    saveDraft({ caption, files: files.map(({ name, language, code, github, marked }) => ({ name, language, code, github, marked })) })
    window.location.assign(connectHref("/create?tab=code"))
  }
  const [imageUrl, setImageUrl] = useState("")
  const [videoUrl , setVideoUrl] = useState("")
  const { photo, select: selectPhoto, clear: clearPhoto } = usePhotoUpload("post")
  const photoBusy = photo !== null && photo.url === null && photo.error === null
  const { video: upload, select: selectVideo, clear: clearVideo } = useVideoUpload()
  const { video: bit, select: selectBit, clear: clearBit } = useVideoUpload(DEVBIT_LENGTH)
  // Post was pressed before the video was ready: publish as soon as it is.
  // Removing or replacing the video, or switching tabs, cancels that.
  const [publishWhenReady, setPublishWhenReady] = useState(false)
  const publishing = useRef(false)

  const publish = useCallback(
    async (data: NewPost) => {
      if (publishing.current) return
      publishing.current = true
      setIsSubmitting(true)
      try {
        const promise = createPost(data)
        toast.promise(promise, {
          loading: "Creating your post...",
          success: "Post created successfully!",
          error: (err) => `Failed to create post: ${err.message}`,
        })
        const created = await promise
        router.push(created.kind === "devbit" ? `/devbits/${created._id}` : "/")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create post")
        publishing.current = false
      } finally {
        setIsSubmitting(false)
      }
    },
    [createPost, router],
  )

  useEffect(() => {
    if (!publishWhenReady) return
    const waiting = activeTab === "devbit" ? bit : upload
    if (!waiting) {
      // The video is gone (removed, or a link typed instead): nothing to wait for.
      setPublishWhenReady(false)
      return
    }
    if (waiting.phase === "ready" && waiting.uploadId) {
      setPublishWhenReady(false)
      publish(
        activeTab === "devbit"
          ? { caption, videoUploadId: waiting.uploadId, kind: "devbit" }
          : { caption, videoUploadId: waiting.uploadId },
      )
    } else if (waiting.phase === "failed") {
      setPublishWhenReady(false)
      setError(waiting.error || UPLOAD_FAILED)
    }
  }, [publishWhenReady, activeTab, upload, bit, caption, publish])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (activeTab === "image") {
      const image = photo?.url || imageUrl.trim()
      if (!image) return setError("Choose a photo or paste an image link")
      return publish({ caption, image })
    }
    if (activeTab === "video") {
      if (upload) {
        if (upload.phase === "failed") return setError(upload.error || UPLOAD_FAILED)
        if (upload.phase !== "ready" || !upload.uploadId) return setPublishWhenReady(true)
        return publish({ caption, videoUploadId: upload.uploadId })
      }
      if (!videoUrl.trim()) return setError("Choose a video or paste a video link")
      return publish({ caption, video: videoUrl.trim() })
    }
    if (activeTab === "devbit") {
      if (!bit) return setError("Choose a video for your DevBit")
      if (bit.phase === "failed") return setError(bit.error || UPLOAD_FAILED)
      if (bit.phase !== "ready" || !bit.uploadId) return setPublishWhenReady(true)
      return publish({ caption, videoUploadId: bit.uploadId, kind: "devbit" })
    }
    const parsed = parseFiles(files.map(({ name, language, code, github, marked }) => ({ name, language, code, github, marked })))
    if ("error" in parsed) return setError(parsed.error)
    // GitHub files go without their code: the server fetches it from GitHub.
    return publish({ caption, files: parsed.files.map(({ code, ...file }) => (file.github ? file : { ...file, code })) })
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Create new post</CardTitle>
          <CardDescription>Share a photo, a video or a code snippet with your followers</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Tabs
              defaultValue="image"
              value={activeTab}
              onValueChange={(value) => {
                setActiveTab(value)
                setPublishWhenReady(false)
              }}
              className="w-full"
            >
              <TabsList className={cn(scrollableTabsList, "md:grid md:grid-cols-4")}>
                <TabsTrigger value="image" className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Image
                </TabsTrigger>
                <TabsTrigger value="video" className="flex items-center gap-2">
                  <VideoIcon className="h-4 w-4" />
                  Video
                </TabsTrigger>
                <TabsTrigger value="code" className="flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  Code
                </TabsTrigger>
                <TabsTrigger value="devbit" className="flex items-center gap-2">
                  <Clapperboard className="h-4 w-4" />
                  DevBit
                </TabsTrigger>
              </TabsList>
              <TabsContent value="image" className="mt-4 space-y-4">
                <MediaPicker
                  kind="image"
                  previewUrl={photo?.previewUrl ?? null}
                  progress={photoBusy && photo ? photo.progress : null}
                  status={photo?.url ? "Photo ready" : photoBusy && photo?.previewUrl ? `Uploading ${Math.round(photo.progress)}%` : null}
                  error={photo?.error ?? null}
                  onSelect={(file) => {
                    setImageUrl("")
                    selectPhoto(file)
                  }}
                  onClear={clearPhoto}
                />
                <div className="space-y-2">
                  <Label htmlFor="imageUrl">Or paste an image link</Label>
                  <Input
                    id="imageUrl"
                    type="url"
                    placeholder="https://example.com/image.jpg"
                    value={imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value)
                      if (e.target.value) clearPhoto()
                    }}
                  />
                </div>
              </TabsContent>
              <TabsContent value="video" className="mt-4 space-y-4">
                <MediaPicker
                  kind="video"
                  previewUrl={upload?.previewUrl ?? null}
                  progress={upload?.phase === "uploading" ? upload.progress : null}
                  status={
                    upload?.phase === "uploading"
                      ? `Uploading ${Math.round(upload.progress)}%`
                      : upload?.phase === "processing"
                        ? "Processing video…"
                        : upload?.phase === "ready"
                          ? "Video ready"
                          : null
                  }
                  error={upload?.error ?? null}
                  onSelect={(file) => {
                    setPublishWhenReady(false)
                    setVideoUrl("")
                    selectVideo(file)
                  }}
                  onClear={() => {
                    setPublishWhenReady(false)
                    clearVideo()
                  }}
                />
                <div className="space-y-2">
                  <Label htmlFor="videoUrl">Or paste a YouTube, Vimeo or video link</Label>
                  <Input
                    id="videoUrl"
                    type="url"
                    placeholder="https://youtu.be/…"
                    value={videoUrl}
                    onChange={(e) => {
                      setVideoUrl(e.target.value)
                      if (e.target.value) clearVideo()
                    }}
                  />
                </div>
              </TabsContent>
              <TabsContent value="code" className="mt-4 space-y-4">
                <CodeFilesEditor files={files} onChange={setFiles} onConnectGitHub={connectGitHub} />
              </TabsContent>
              <TabsContent value="devbit" className="mt-4 space-y-4">
                <MediaPicker
                  kind="video"
                  previewUrl={bit?.previewUrl ?? null}
                  progress={bit?.phase === "uploading" ? bit.progress : null}
                  status={
                    bit?.phase === "uploading"
                      ? `Uploading ${Math.round(bit.progress)}%`
                      : bit?.phase === "processing"
                        ? "Processing video…"
                        : bit?.phase === "ready"
                          ? "Video ready"
                          : null
                  }
                  error={bit?.error ?? null}
                  onSelect={(file) => {
                    setPublishWhenReady(false)
                    selectBit(file)
                  }}
                  onClear={() => {
                    setPublishWhenReady(false)
                    clearBit()
                  }}
                />
                <p className="text-sm text-muted-foreground">Up to 90 seconds. Vertical videos fill the screen.</p>
              </TabsContent>
            </Tabs>
            <div className="mt-4 space-y-2">
              <Label htmlFor="caption">Caption</Label>
              <Textarea
                id="caption"
                placeholder="Write a caption..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              disabled={isSubmitting || publishWhenReady || (activeTab === "image" && photoBusy)}
              className="mt-4 w-full"
            >
              {isSubmitting ? "Posting..." : publishWhenReady ? "Processing video…" : "Post"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
