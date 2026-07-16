'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updateUserSchema, type UpdateUserInput } from '@/lib/validations/users'
import { updateUser, deleteUser } from '@/lib/actions/users'
import type { UserListItem, TeamListItem } from '@/lib/actions/users'
import { DeleteUserDialog } from './DeleteUserDialog'

const ROLE_LABEL: Record<string, string> = {
  SALES_EXEC: 'Sales Executive',
  SALES_MANAGER: 'Sales Manager',
  COO: 'COO',
  CEO: 'CEO',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
}

type Props = {
  user: UserListItem | null
  teams: TeamListItem[]
  currentUserId: string
  canManageUsers: boolean
  canDeleteUsers: boolean
  onClose: () => void
}

export function EditUserSheet({
  user,
  teams,
  currentUserId,
  canManageUsers,
  canDeleteUsers,
  onClose,
}: Props) {
  const [isPending, startTransition] = useTransition()

  // Delete flow (lives here so it is tucked away inside the account sheet).
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, startDeleteTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
  })

  // Populate form when user changes
  useEffect(() => {
    if (user) {
      reset({
        name: user.name,
        jobTitle: user.jobTitle ?? '',
        role: user.role as UpdateUserInput['role'],
        teamId: user.teamId ?? undefined,
        signatureImageUrl: user.signatureImageUrl ?? '',
        isActive: user.isActive,
      })
    }
    // Reset the delete sub-flow whenever the target changes / sheet reopens.
    setDeleteOpen(false)
    setDeleteError(null)
  }, [user, reset])

  // A deleted user is always read-only, even for Super Admin. COO/CEO are
  // always read-only (they can only delete, not manage).
  const isEditable = canManageUsers && !user?.deletedAt

  // Delete is offered only to delete-capable roles, for a still-present user
  // that isn't yourself, and (enforced again on the server) that has already
  // been deactivated.
  const canOfferDelete =
    canDeleteUsers && !!user && !user.deletedAt && user.id !== currentUserId

  function onSubmit(data: UpdateUserInput) {
    if (!user) return
    startTransition(async () => {
      const result = await updateUser(user.id, data)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'User updated', description: `${data.name}'s profile has been saved.` })
        onClose()
      }
    })
  }

  function handleDeleteConfirm(password: string) {
    if (!user) return
    setDeleteError(null)
    startDeleteTransition(async () => {
      const result = await deleteUser(user.id, password)
      if ('error' in result) {
        setDeleteError(result.error)
      } else {
        const name = user.name
        setDeleteOpen(false)
        onClose()
        toast({
          title: 'User deleted',
          description: `${name} has been deleted. Their history is preserved.`,
        })
      }
    })
  }

  const signatureImageUrl = watch('signatureImageUrl')

  // Read a chosen image as a data URI and store it on the form. Kept small (data
  // URI in the DB) so it renders directly in the Puppeteer-generated PDF.
  function handleSignatureFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        description: 'Choose an image file (PNG or JPG).',
        variant: 'destructive',
      })
      e.currentTarget.value = ''
      return
    }
    if (file.size > 500 * 1024) {
      toast({
        title: 'Image too large',
        description: 'Signature image must be under 500 KB.',
        variant: 'destructive',
      })
      e.currentTarget.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () =>
      setValue('signatureImageUrl', String(reader.result), { shouldDirty: true })
    reader.readAsDataURL(file)
    e.currentTarget.value = ''
  }

  return (
    <>
    <Sheet open={!!user} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditable ? 'Edit User' : 'User details'}</SheetTitle>
        </SheetHeader>

        {isEditable ? (
          <div className="space-y-4 mt-6">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Full name</Label>
              <Input
                id="edit-name"
                aria-invalid={!!errors.name}
                {...register('name')}
              />
              {errors.name && (
                <p className="text-xs text-[var(--color-danger)]">{errors.name.message}</p>
              )}
            </div>

            {/* Job title */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-job-title">Job title</Label>
              <Input
                id="edit-job-title"
                placeholder="e.g. Account Executive"
                {...register('jobTitle')}
              />
            </div>

            {/* Signature image */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-signature">Signature image</Label>
              <p className="text-xs text-[var(--color-muted)]">
                Shown on approved proposal PDFs for sign-off (e.g. COO/CEO). PNG or JPG,
                under 500&nbsp;KB.
              </p>
              {signatureImageUrl ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signatureImageUrl}
                    alt={`${user?.name ?? 'User'} signature`}
                    className="h-16 w-auto max-w-[200px] rounded border border-[var(--color-border)] bg-white object-contain p-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setValue('signatureImageUrl', '', { shouldDirty: true })}
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
              <Input
                id="edit-signature"
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleSignatureFile}
                className="cursor-pointer"
              />
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={watch('role') ?? ''}
                onValueChange={(v) => setValue('role', v as UpdateUserInput['role'])}
              >
                <SelectTrigger id="edit-role" aria-invalid={!!errors.role}>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SALES_EXEC">Sales Executive</SelectItem>
                  <SelectItem value="SALES_MANAGER">Sales Manager</SelectItem>
                  <SelectItem value="COO">COO</SelectItem>
                  <SelectItem value="CEO">CEO</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                </SelectContent>
              </Select>
              {errors.role && (
                <p className="text-xs text-[var(--color-danger)]">{errors.role.message}</p>
              )}
            </div>

            {/* Team */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-team">Team</Label>
              <Select
                value={watch('teamId') ?? '_none'}
                onValueChange={(v) => setValue('teamId', v === '_none' ? undefined : v)}
              >
                <SelectTrigger id="edit-team">
                  <SelectValue placeholder="No team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No team</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Active status */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={watch('isActive') ? 'active' : 'inactive'}
                onValueChange={(v) => setValue('isActive', v === 'active')}
              >
                <SelectTrigger id="edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" disabled={isPending} onClick={handleSubmit(onSubmit)}>
                {isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        ) : (
          // Read-only view (COO/CEO, or any already-deleted user).
          <div className="space-y-4 mt-6">
            <ReadOnlyRow label="Full name" value={user?.name} />
            <ReadOnlyRow label="Email" value={user?.email} />
            <ReadOnlyRow label="Job title" value={user?.jobTitle || '—'} />
            <ReadOnlyRow label="Role" value={user ? ROLE_LABEL[user.role] ?? user.role : ''} />
            <ReadOnlyRow label="Team" value={user?.teamName ?? '—'} />
            <ReadOnlyRow
              label="Status"
              value={
                user?.deletedAt ? 'Deleted' : user?.isActive ? 'Active' : 'Inactive'
              }
            />
          </div>
        )}

        {/* Danger zone — permanent delete, tucked at the bottom of the sheet */}
        {canOfferDelete && (
          <div className="mt-8 border-t border-[var(--color-border)] pt-4">
            <h3 className="text-sm font-semibold text-[var(--color-danger)]">
              Danger zone
            </h3>
            {user?.isActive ? (
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Deactivate this user first. Once deactivated, a delete option
                appears here.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-[var(--color-muted)]">
                  Deleting removes {user?.name} from User Management and revokes
                  their login. Their proposal and approval history is preserved.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 gap-2 text-[var(--color-danger)] hover:bg-red-50 min-h-[44px]"
                  onClick={() => {
                    setDeleteError(null)
                    setDeleteOpen(true)
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  Delete user
                </Button>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>

    <DeleteUserDialog
      user={deleteOpen ? user : null}
      isPending={isDeleting}
      error={deleteError}
      onCancel={() => {
        if (!isDeleting) {
          setDeleteOpen(false)
          setDeleteError(null)
        }
      }}
      onConfirm={handleDeleteConfirm}
    />
    </>
  )
}

function ReadOnlyRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-[var(--color-muted)]">{label}</p>
      <p className="text-sm text-[var(--color-primary)] break-words">{value || '—'}</p>
    </div>
  )
}
