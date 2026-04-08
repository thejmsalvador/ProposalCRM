'use client'

import { useWizard } from '../WizardContext'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RichTextEditor } from '@/components/ui/rich-text-editor'

export function Step1ClientDetails() {
  const { form, approvers, currentUser } = useWizard()
  const { register, setValue, watch, formState: { errors } } = form

  const introText = watch('introText')
  const assignedApproverId = watch('assignedApproverId')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-primary)]">
          Client & Engagement Details
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Basic information about the client and this proposal.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Client Name */}
        <div className="space-y-1.5">
          <Label htmlFor="clientName">Client Name *</Label>
          <Input
            id="clientName"
            placeholder="e.g. Acme Corp"
            {...register('clientName')}
          />
          {errors.clientName && (
            <p className="text-xs text-[var(--color-danger)]">
              {errors.clientName.message}
            </p>
          )}
        </div>

        {/* Project Title */}
        <div className="space-y-1.5">
          <Label htmlFor="projectTitle">Project Title *</Label>
          <Input
            id="projectTitle"
            placeholder="e.g. Q1 Brand Campaign"
            {...register('projectTitle')}
          />
          {errors.projectTitle && (
            <p className="text-xs text-[var(--color-danger)]">
              {errors.projectTitle.message}
            </p>
          )}
        </div>

        {/* Contact Name */}
        <div className="space-y-1.5">
          <Label htmlFor="contactName">Contact Person</Label>
          <Input
            id="contactName"
            placeholder="e.g. Juan Dela Cruz"
            {...register('contactName')}
          />
        </div>

        {/* Contact Title */}
        <div className="space-y-1.5">
          <Label htmlFor="contactTitle">Contact Title</Label>
          <Input
            id="contactTitle"
            placeholder="e.g. Marketing Director"
            {...register('contactTitle')}
          />
        </div>

        {/* Proposal Date */}
        <div className="space-y-1.5">
          <Label htmlFor="date">Proposal Date *</Label>
          <Input
            id="date"
            type="date"
            {...register('date')}
          />
          {errors.date && (
            <p className="text-xs text-[var(--color-danger)]">
              {errors.date.message}
            </p>
          )}
        </div>

        {/* Valid Until */}
        <div className="space-y-1.5">
          <Label htmlFor="validUntil">Valid Until *</Label>
          <Input
            id="validUntil"
            type="date"
            {...register('validUntil')}
          />
          {errors.validUntil && (
            <p className="text-xs text-[var(--color-danger)]">
              {errors.validUntil.message}
            </p>
          )}
        </div>

        {/* Salesperson (read-only) */}
        <div className="space-y-1.5">
          <Label htmlFor="salesperson">Salesperson</Label>
          <Input
            id="salesperson"
            value={currentUser.name}
            readOnly
            className="bg-slate-50"
          />
        </div>

        {/* Assigned Approver */}
        <div className="space-y-1.5">
          <Label htmlFor="assignedApproverId">Assigned Approver</Label>
          <Select
            value={assignedApproverId}
            onValueChange={(val) => setValue('assignedApproverId', val)}
          >
            <SelectTrigger id="assignedApproverId">
              <SelectValue placeholder="Select approver..." />
            </SelectTrigger>
            <SelectContent>
              {approvers.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} ({a.role.replace('_', ' ')})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="space-y-1.5">
        <Label htmlFor="introText">Executive Summary / Cover Note</Label>
        <p className="text-xs text-[var(--color-muted)]">
          Optional introductory text that appears on the proposal cover page.
        </p>
        <RichTextEditor
          value={introText}
          onChange={(html) => setValue('introText', html)}
          placeholder="Write a brief introduction for this proposal..."
        />
      </div>
    </div>
  )
}
