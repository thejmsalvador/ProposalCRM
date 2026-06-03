'use client'

import { useState, useEffect, useRef } from 'react'
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
import { searchClients } from '@/lib/actions/clients'
import type { ClientOption } from '@/lib/actions/clients'
import { Building2, UserPlus } from 'lucide-react'

export function Step1ClientDetails() {
  const { form, approvers, currentUser } = useWizard()
  const { register, setValue, watch, formState: { errors } } = form

  const introText = watch('introText')
  const assignedApproverId = watch('assignedApproverId')
  const clientName = watch('clientName')
  const clientId = watch('clientId')

  // ─── Client combobox state ─────────────────────────────────────────────────
  const [clientQuery, setClientQuery] = useState(clientName || '')
  const [suggestions, setSuggestions] = useState<ClientOption[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isNewClient, setIsNewClient] = useState(false)
  const comboboxRef = useRef<HTMLDivElement>(null)

  // Sync external value changes (e.g. template apply, pre-selected clientId)
  useEffect(() => {
    setClientQuery(clientName || '')
  }, [clientName])

  // Fetch suggestions on query change (debounced 300ms)
  useEffect(() => {
    if (!clientQuery.trim() || clientQuery.length < 1) {
      setSuggestions([])
      return
    }
    const timeout = setTimeout(async () => {
      const results = await searchClients(clientQuery)
      setSuggestions(results)
    }, 300)
    return () => clearTimeout(timeout)
  }, [clientQuery])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleClientInput(value: string) {
    setClientQuery(value)
    setValue('clientName', value)
    setValue('clientId', null)           // clear clientId when user types
    setShowSuggestions(true)
    setIsNewClient(false)
  }

  function selectClient(client: ClientOption) {
    setValue('clientId', client.id)
    setValue('clientName', client.companyName)
    if (client.primaryContact?.contactName) {
      setValue('contactName', client.primaryContact.contactName)
    }
    if (client.primaryContact?.contactTitle) {
      setValue('contactTitle', client.primaryContact.contactTitle)
    }
    setClientQuery(client.companyName)
    setSuggestions([])
    setShowSuggestions(false)
    setIsNewClient(false)
  }

  function markAsNewClient() {
    setValue('clientId', null)
    setIsNewClient(true)
    setShowSuggestions(false)
  }

  const exactMatch = suggestions.some(
    (s) => s.companyName.toLowerCase() === clientQuery.toLowerCase(),
  )

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
        {/* Client Name — combobox */}
        <div className="space-y-1.5" ref={comboboxRef}>
          <Label htmlFor="clientName">Client Name *</Label>
          <div className="relative">
            <Input
              id="clientName"
              placeholder="e.g. Acme Corp"
              value={clientQuery}
              onChange={(e) => handleClientInput(e.target.value)}
              onFocus={() => clientQuery.length > 0 && setShowSuggestions(true)}
              autoComplete="off"
              aria-invalid={!!errors.clientName}
              aria-describedby={errors.clientName ? 'clientName-error' : undefined}
            />

            {showSuggestions && (suggestions.length > 0 || (clientQuery.length > 1 && !exactMatch)) && (
              <div className="absolute left-0 top-full mt-1 z-50 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                {suggestions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => selectClient(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-start gap-2"
                  >
                    <Building2 size={14} className="text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-medium text-slate-800">{c.companyName}</div>
                      {c.primaryContact?.contactName && (
                        <div className="text-xs text-slate-500">
                          {c.primaryContact.contactName}
                          {c.primaryContact.contactTitle ? `, ${c.primaryContact.contactTitle}` : ''}
                        </div>
                      )}
                      {c.industry && (
                        <div className="text-xs text-slate-400">{c.industry}</div>
                      )}
                    </div>
                  </button>
                ))}
                {!exactMatch && clientQuery.trim().length > 1 && (
                  <button
                    type="button"
                    onMouseDown={markAsNewClient}
                    className="w-full text-left px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 border-t border-slate-100"
                  >
                    <UserPlus size={14} className="shrink-0" />
                    Add &ldquo;{clientQuery}&rdquo; as new client
                  </button>
                )}
              </div>
            )}
          </div>
          {clientId && (
            <p className="text-xs text-indigo-600 flex items-center gap-1">
              <Building2 size={10} />
              Linked to existing client record
            </p>
          )}
          {isNewClient && !clientId && (
            <p className="text-xs text-indigo-600">
              This client will be saved to your contact book when you save the proposal.
            </p>
          )}
          {errors.clientName && (
            <p id="clientName-error" className="text-xs text-[var(--color-danger)]">
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
            aria-invalid={!!errors.projectTitle}
            aria-describedby={errors.projectTitle ? 'projectTitle-error' : undefined}
            {...register('projectTitle')}
          />
          {errors.projectTitle && (
            <p id="projectTitle-error" className="text-xs text-[var(--color-danger)]">
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
            aria-invalid={!!errors.date}
            aria-describedby={errors.date ? 'date-error' : undefined}
            {...register('date')}
          />
          {errors.date && (
            <p id="date-error" className="text-xs text-[var(--color-danger)]">
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
            aria-invalid={!!errors.validUntil}
            aria-describedby={errors.validUntil ? 'validUntil-error' : undefined}
            {...register('validUntil')}
          />
          {errors.validUntil && (
            <p id="validUntil-error" className="text-xs text-[var(--color-danger)]">
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
