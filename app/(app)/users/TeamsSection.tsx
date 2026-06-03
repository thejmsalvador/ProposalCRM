'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Users } from 'lucide-react'
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
import { createTeamSchema, type CreateTeamInput } from '@/lib/validations/users'
import { createTeam } from '@/lib/actions/users'
import type { TeamListItem, UserListItem } from '@/lib/actions/users'

type Props = {
  teams: TeamListItem[]
  managers: UserListItem[]
}

export function TeamsSection({ teams, managers }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateTeamInput>({
    resolver: zodResolver(createTeamSchema),
  })

  function onSubmit(data: CreateTeamInput) {
    startTransition(async () => {
      const result = await createTeam(data)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Team created', description: `"${data.name}" has been added.` })
        reset()
        setDialogOpen(false)
      }
    })
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-primary)]">Teams</h2>
          <p className="text-sm text-[var(--color-muted)]">
            {teams.length} {teams.length === 1 ? 'team' : 'teams'}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setDialogOpen(true)}
          className="gap-2"
        >
          <Plus size={14} aria-hidden="true" />
          Add team
        </Button>
      </div>

      {teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-[var(--color-border)] bg-white gap-3">
          <Users size={32} className="text-[var(--color-muted)]" aria-hidden="true" />
          <p className="text-sm text-[var(--color-muted)]">No teams yet.</p>
          <Button type="button" size="sm" onClick={() => setDialogOpen(true)}>
            Create your first team
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">
                  Team name
                </th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">
                  Manager
                </th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-muted)]">
                  Members
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {teams.map((team) => (
                <tr key={team.id} className="hover:bg-[var(--color-surface)] transition-colors">
                  <td className="px-4 py-3 font-medium text-[var(--color-primary)]">
                    {team.name}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {team.managerName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {team.memberCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Team Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Team</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Team name</Label>
              <Input
                id="team-name"
                placeholder="e.g. Sales Team Alpha"
                aria-invalid={!!errors.name}
                {...register('name')}
              />
              {errors.name && (
                <p className="text-xs text-[var(--color-danger)]">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="team-manager">Manager (optional)</Label>
              <Select
                value={watch('managerId') ?? '_none'}
                onValueChange={(v) => setValue('managerId', v === '_none' ? undefined : v)}
              >
                <SelectTrigger id="team-manager">
                  <SelectValue placeholder="No manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No manager</SelectItem>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  reset()
                  setDialogOpen(false)
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isPending}
                onClick={handleSubmit(onSubmit)}
              >
                {isPending ? 'Creating…' : 'Create team'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
