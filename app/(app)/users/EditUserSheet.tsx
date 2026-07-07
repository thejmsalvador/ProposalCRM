'use client'

import { useEffect, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { updateUser } from '@/lib/actions/users'
import type { UserListItem, TeamListItem } from '@/lib/actions/users'

type Props = {
  user: UserListItem | null
  teams: TeamListItem[]
  onClose: () => void
}

export function EditUserSheet({ user, teams, onClose }: Props) {
  const [isPending, startTransition] = useTransition()

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
  }, [user, reset])

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
    <Sheet open={!!user} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit User</SheetTitle>
        </SheetHeader>

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
      </SheetContent>
    </Sheet>
  )
}
