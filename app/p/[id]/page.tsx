import { MainLayout } from "@/components/main-layout"
import { PostDetail } from "@/components/post-detail"

export default function PostPage({ params }: { params: { id: string } }) {
  return (
    <MainLayout>
      <PostDetail id={params.id} />
    </MainLayout>
  )
}
