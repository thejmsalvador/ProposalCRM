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
  allUsers: UserListItem[]
  onClose: () => void
}

export function EditUserSheet({ user, teams, allUsers, onClose }: Props) {
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
        defaultApproverId: user.defaultApproverId ?? undefined,
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

  // Sales Managers for the Default Approver dropdown
  const managers = allUsers.filter((u) => u.role === 'SALES_MANAGER')

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

          {/* Default approver */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-approver">Default approver</Label>
            <Select
              value={watch('defaultApproverId') ?? '_none'}
              onValueChange={(v) =>
                setValue('defaultApproverId', v === '_none' ? undefined : v)
              }
            >
              <SelectTrigger id="edit-approver">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None</SelectItem>
                {managers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
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
