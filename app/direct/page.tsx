import { Suspense } from "react"
import { MainLayout } from "@/components/main-layout"
import { DirectMessages } from "@/components/direct-messages"

export default function DirectMessagesPage() {
  return (
    <MainLayout>
      <Suspense fallback={null}>
        <DirectMessages />
      </Suspense>
    </MainLayout>
  )
}
