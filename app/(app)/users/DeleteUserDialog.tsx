'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import type { UserListItem } from '@/lib/actions/users'

type Props = {
  user: UserListItem | null
  isPending: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (password: string) => void
}

/**
 * Second-factor confirm for the delete action: the acting SUPER_ADMIN / COO /
 * CEO must re-type their OWN password before a (already-deactivated) user is
 * deleted. The password is re-verified server-side in `deleteUser`. The delete
 * is a soft-delete — the user's history is preserved.
 */
export function DeleteUserDialog({ user, isPending, error, onCancel, onConfirm }: Props) {
  const [password, setPassword] = useState('')

  // Reset the field whenever a new target is selected (or the dialog closes).
  useEffect(() => {
    setPassword('')
  }, [user?.id])

  const open = user !== null

  return (
    <Dialog open={open} onOpenChange={(o) => !isPending && !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--color-danger)]">
            <AlertTriangle size={18} aria-hidden="true" />
            Delete user
          </DialogTitle>
          <DialogDescription>
            This removes{' '}
            <span className="font-medium text-slate-700">{user?.name}</span> (
            {user?.email}) from User Management and revokes their login. Their
            proposal and approval history is preserved. Confirm with your
            password to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="delete-confirm-password">
            Confirm your password to continue
          </Label>
          <Input
            id="delete-confirm-password"
            type="password"
            autoComplete="current-password"
            placeholder="Your account password"
            value={password}
            disabled={isPending}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && password && !isPending) onConfirm(password)
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'delete-confirm-error' : undefined}
          />
          {error && (
            <p id="delete-confirm-error" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            disabled={isPending || !password}
            onClick={() => onConfirm(password)}
          >
            {isPending ? 'Deleting…' : 'Delete user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
