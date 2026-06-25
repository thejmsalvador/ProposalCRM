'use client'

import { useState, useEffect, useRef } from 'react'
import { useWizard } from '../WizardContext'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { searchClients } from '@/lib/actions/clients'
import type { ClientOption } from '@/lib/actions/clients'
import { Building2, FolderKanban, UserPlus } from 'lucide-react'

function SectionHeading({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="flex items-start gap-2.5 pb-3 border-b border-[var(--color-border)]">
      <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-light)] text-[var(--color-accent)] flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-primary)]">{title}</h3>
        <p className="text-xs text-[var(--color-muted)]">{subtitle}</p>
      </div>
    </div>
  )
}

export function Step1ClientDetails() {
  const { form } = useWizard()
  const { register, setValue, watch, formState: { errors } } = form

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
    if (client.accountCode) setValue('accountCode', client.accountCode.toUpperCase())
    const primary = client.primaryContact
    if (primary?.contactName) setValue('contactName', primary.contactName)
    if (primary?.contactTitle) setValue('contactTitle', primary.contactTitle)
    if (primary?.department) setValue('department', primary.department)
    if (primary?.email) setValue('contactEmail', primary.email)
    if (primary?.phone) setValue('contactPhone', primary.phone)
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
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-primary)]">
          Client & Project Details
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Who this proposal is for, and what it covers.
        </p>
      </div>

      {/* ─── Section 1: Client Details ─────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          icon={<Building2 size={16} aria-hidden="true" />}
          title="Client Details"
          subtitle="The company and its representative for this proposal."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Company Name — combobox */}
          <div className="space-y-1.5" ref={comboboxRef}>
            <Label htmlFor="clientName">Company Name *</Label>
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
                      Add &ldquo;{clientQuery}&rdquo; as new company
                    </button>
                  )}
                </div>
              )}
            </div>
            {clientId && (
              <p className="text-xs text-indigo-600 flex items-center gap-1">
                <Building2 size={10} />
                Linked to existing company record
              </p>
            )}
            {isNewClient && !clientId && (
              <p className="text-xs text-indigo-600">
                This company will be saved to your contact book when you save the proposal.
              </p>
            )}
            {errors.clientName && (
              <p id="clientName-error" className="text-xs text-[var(--color-danger)]">
                {errors.clientName.message}
              </p>
            )}
          </div>

          {/* Account Code */}
          <div className="space-y-1.5">
            <Label htmlFor="accountCode">Account Code</Label>
            <Input
              id="accountCode"
              placeholder="e.g. SUNB"
              autoCapitalize="characters"
              {...register('accountCode')}
              onChange={(e) =>
                setValue('accountCode', e.target.value.toUpperCase(), { shouldDirty: true })
              }
            />
            <p className="text-xs text-[var(--color-muted)]">
              Short internal code for this client (usually 3–5 letters).
            </p>
          </div>

          {/* Department */}
          <div className="space-y-1.5">
            <Label htmlFor="department">Department</Label>
            <Input
              id="department"
              placeholder="e.g. Marketing"
              {...register('department')}
            />
          </div>

          {/* Contact Person */}
          <div className="space-y-1.5">
            <Label htmlFor="contactName">Contact Person *</Label>
            <Input
              id="contactName"
              placeholder="e.g. Juan Dela Cruz"
              aria-invalid={!!errors.contactName}
              aria-describedby={errors.contactName ? 'contactName-error' : undefined}
              {...register('contactName')}
            />
            {errors.contactName && (
              <p id="contactName-error" className="text-xs text-[var(--color-danger)]">
                {errors.contactName.message}
              </p>
            )}
          </div>

          {/* Position */}
          <div className="space-y-1.5">
            <Label htmlFor="contactTitle">Position *</Label>
            <Input
              id="contactTitle"
              placeholder="e.g. Marketing Director"
              aria-invalid={!!errors.contactTitle}
              aria-describedby={errors.contactTitle ? 'contactTitle-error' : undefined}
              {...register('contactTitle')}
            />
            {errors.contactTitle && (
              <p id="contactTitle-error" className="text-xs text-[var(--color-danger)]">
                {errors.contactTitle.message}
              </p>
            )}
          </div>

          {/* Email Address */}
          <div className="space-y-1.5">
            <Label htmlFor="contactEmail">Email Address *</Label>
            <Input
              id="contactEmail"
              type="email"
              placeholder="e.g. juan@acmecorp.com"
              aria-invalid={!!errors.contactEmail}
              aria-describedby={errors.contactEmail ? 'contactEmail-error' : undefined}
              {...register('contactEmail')}
            />
            {errors.contactEmail && (
              <p id="contactEmail-error" className="text-xs text-[var(--color-danger)]">
                {errors.contactEmail.message}
              </p>
            )}
          </div>

          {/* Contact Number */}
          <div className="space-y-1.5">
            <Label htmlFor="contactPhone">Contact Number *</Label>
            <Input
              id="contactPhone"
              type="tel"
              placeholder="e.g. +63 917 123 4567"
              aria-invalid={!!errors.contactPhone}
              aria-describedby={errors.contactPhone ? 'contactPhone-error' : undefined}
              {...register('contactPhone')}
            />
            {errors.contactPhone && (
              <p id="contactPhone-error" className="text-xs text-[var(--color-danger)]">
                {errors.contactPhone.message}
              </p>
            )}
          </div>

          {/* Business Address */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="businessAddress">Business Address</Label>
            <Input
              id="businessAddress"
              placeholder="e.g. 123 Ayala Ave, Makati City, Metro Manila"
              {...register('businessAddress')}
            />
          </div>

          {/* TIN Number */}
          <div className="space-y-1.5">
            <Label htmlFor="tin">TIN Number</Label>
            <Input
              id="tin"
              placeholder="e.g. 123-456-789-000"
              {...register('tin')}
            />
          </div>
        </div>
      </section>

      {/* ─── Section 2: Project Details ────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          icon={<FolderKanban size={16} aria-hidden="true" />}
          title="Project Details"
          subtitle="The engagement this proposal covers and its validity."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Brand Name */}
          <div className="space-y-1.5">
            <Label htmlFor="brandName">Brand Name</Label>
            <Input
              id="brandName"
              placeholder="e.g. Acme Cola"
              {...register('brandName')}
            />
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
        </div>
      </section>
    </div>
  )
}
