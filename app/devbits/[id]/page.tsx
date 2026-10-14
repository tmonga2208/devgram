import { MainLayout } from "@/components/main-layout"
import { DevBitsScreen } from "@/components/devbits/devbits-screen"

export default async function DevBitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ user?: string | string[] }>
}) {
  const { id } = await params
  const { user } = await searchParams

  return (
    <MainLayout fill>
      <DevBitsScreen startId={id} user={typeof user === "string" ? user : undefined} />
    </MainLayout>
  )
}
