"use client"

import { Comments } from "@/components/comments"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { CommentType, PostType } from "@/lib/types"

interface DevBitCommentsProps {
  // The DevBit whose comments are open, or null when the panel is closed.
  devbit: PostType | null
  onClose: () => void
  onAdded: (id: string, comment: CommentType) => void
  onRemoved: (id: string) => void
}

// Comments in a panel over the video: a sheet from the bottom on phones, a
// dialog on wider screens. The list scrolls and the box to write one stays
// below it. Opening it doesn't focus that box, so a phone's keyboard stays
// down until the person taps it. Closing it leaves the feed where it was.
export function DevBitComments({ devbit, onClose, onAdded, onRemoved }: DevBitCommentsProps) {
  return (
    <Dialog open={devbit !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="flex max-h-[75dvh] flex-col gap-4 max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:pb-[max(1.5rem,var(--safe-bottom))]"
      >
        <DialogTitle>Comments</DialogTitle>
        {devbit && (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <Comments
              postId={devbit._id}
              comments={devbit.comments}
              onAdded={(comment) => onAdded(devbit._id, comment)}
              onRemoved={() => onRemoved(devbit._id)}
              listClassName="min-h-0 flex-1 overflow-y-auto"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
