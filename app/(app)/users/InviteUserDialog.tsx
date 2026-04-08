'use client'

import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { inviteUserSchema, type InviteUserInput } from '@/lib/validations/users'
import { inviteUser } from '@/lib/actions/users'
import type { TeamListItem } from '@/lib/actions/users'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  teams: TeamListItem[]
}

export function InviteUserDialog({ open, onOpenChange, teams }: Props) {
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<InviteUserInput>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { role: 'SALES_EXEC' },
  })

  function onSubmit(data: InviteUserInput) {
    startTransition(async () => {
      const result = await inviteUser(data)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Invite sent', description: `Invite email sent to ${data.email}` })
        reset()
        onOpenChange(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Full name */}
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">Full name</Label>
            <Input
              id="invite-name"
              placeholder="Jane Santos"
              aria-invalid={!!errors.name}
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-[var(--color-danger)]">{errors.name.message}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="jane@agency.com"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-[var(--color-danger)]">{errors.email.message}</p>
            )}
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={watch('role')}
              onValueChange={(v) => setValue('role', v as InviteUserInput['role'])}
            >
              <SelectTrigger id="invite-role" aria-invalid={!!errors.role}>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SALES_EXEC">Sales Executive</SelectItem>
                <SelectItem value="SALES_MANAGER">Sales Manager</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
            {errors.role && (
              <p className="text-xs text-[var(--color-danger)]">{errors.role.message}</p>
            )}
          </div>

          {/* Job title */}
          <div className="space-y-1.5">
            <Label htmlFor="invite-job-title">Job title (optional)</Label>
            <Input
              id="invite-job-title"
              placeholder="Account Executive"
              {...register('jobTitle')}
            />
          </div>

          {/* Team */}
          <div className="space-y-1.5">
            <Label htmlFor="invite-team">Team (optional)</Label>
            <Select
              value={watch('teamId') ?? ''}
              onValueChange={(v) => setValue('teamId', v === '_none' ? undefined : v)}
            >
              <SelectTrigger id="invite-team">
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

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={handleSubmit(onSubmit)}
            >
              {isPending ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
