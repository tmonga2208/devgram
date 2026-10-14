"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface DevBitDeleteDialogProps {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}

// Asks before deleting one of your own DevBits.
export function DevBitDeleteDialog({ open, onCancel, onConfirm }: DevBitDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this DevBit?</DialogTitle>
          <DialogDescription>It is removed for everyone, with its likes and comments.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
