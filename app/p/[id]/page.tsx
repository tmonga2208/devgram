import { MainLayout } from "@/components/main-layout"
import { PostDetail } from "@/components/post-detail"

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <MainLayout>
      <PostDetail id={id} />
    </MainLayout>
  )
}
