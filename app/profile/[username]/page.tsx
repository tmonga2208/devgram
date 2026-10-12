import { MainLayout } from "@/components/main-layout"
import { Profile } from "@/components/profile"

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params

  return (
    <MainLayout>
      <Profile username={username} />
    </MainLayout>
  )
}
