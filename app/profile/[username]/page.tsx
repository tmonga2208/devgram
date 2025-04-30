import { MainLayout } from "@/components/main-layout"
import { Profile } from "@/components/profile"

export default function ProfilePage({ params }: { params: { username: string } }) {
  return (
    <MainLayout>
      <Profile username={params.username} />
    </MainLayout>
  )
}
