import { MainLayout } from "@/components/main-layout"
import { CreatePostForm } from "@/components/create-post-form"

export default async function CreatePost({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams

  return (
    <MainLayout>
      <CreatePostForm initialTab={typeof tab === "string" ? tab : undefined} />
    </MainLayout>
  )
}
