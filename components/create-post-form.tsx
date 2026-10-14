"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Code, ImageIcon, VideoIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { usePosts } from "@/contexts/posts-context"
import { MediaPicker } from "@/components/media-picker"
import { usePhotoUpload } from "@/hooks/use-photo-upload"
import toast from "react-hot-toast"

export function CreatePostForm() {
  const router = useRouter()
  const { createPost } = usePosts()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState("image")
  const [caption, setCaption] = useState("")
  const [code, setCode] = useState("")
  const [language, setLanguage] = useState("javascript")
  const [imageUrl, setImageUrl] = useState("")
  const [videoUrl , setVideoUrl] = useState("")
  const { photo, select: selectPhoto, clear: clearPhoto } = usePhotoUpload("post")
  const photoBusy = photo !== null && photo.url === null && photo.error === null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsSubmitting(true)

    try {
      const image = photo?.url || imageUrl.trim()
      if (activeTab === "image" && !image) {
        setError("Choose a photo or paste an image link")
        setIsSubmitting(false)
        return
      }

      if (activeTab === "video" && !videoUrl) {
        setError("Video URL is required for video posts")
        toast.error("Video URL is required for video posts")
        setIsSubmitting(false)
        return
      }

      if (activeTab === "code" && !code) {
        setError("Code is required for code posts")
        toast.error("Code is required for code posts")
        setIsSubmitting(false)
        return
      }

      const promise = createPost({
        caption,
        image: activeTab === "image" ? image : undefined,
        code: activeTab === "code" ? code : undefined,
        video: activeTab === "video" ? videoUrl : undefined,
        language: activeTab === "code" ? language : undefined,
      })

      toast.promise(promise, {
        loading: 'Creating your post...',
        success: 'Post created successfully!',
        error: (err) => `Failed to create post: ${err.message}`,
      })

      await promise
      router.push("/")
    } catch (err) {
      // toast.promise above has already shown the error toast.
      setError(err instanceof Error ? err.message : "Failed to create post")
    } finally {
      setIsSubmitting(false)
    }
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
            <Tabs defaultValue="image" value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
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
                <div className="space-y-2">
                  <Label htmlFor="videoUrl">Video URL</Label>
                  <Input
                    id="videoUrl"
                    type="url"
                    placeholder="https://example.com/video.mp4"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    required={activeTab === "video"}
                  />
                </div>
              </TabsContent>
              <TabsContent value="code" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="javascript">JavaScript</SelectItem>
                      <SelectItem value="typescript">TypeScript</SelectItem>
                      <SelectItem value="jsx">JSX/React</SelectItem>
                      <SelectItem value="html">HTML</SelectItem>
                      <SelectItem value="css">CSS</SelectItem>
                      <SelectItem value="python">Python</SelectItem>
                      <SelectItem value="java">Java</SelectItem>
                      <SelectItem value="csharp">C#</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <Textarea
                    id="code"
                    placeholder="Paste your code here..."
                    className="min-h-[200px] font-mono"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required={activeTab === "code"}
                  />
                </div>
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
            <Button type="submit" disabled={isSubmitting || (activeTab === "image" && photoBusy)} className="mt-4 w-full">
              {isSubmitting ? "Posting..." : "Post"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
