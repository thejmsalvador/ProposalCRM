'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Settings } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateSystemSettings } from '@/lib/actions/settings'
import {
  systemSettingsSchema,
  type SystemSettingsInput,
} from '@/lib/validations/settings'

type Props = {
  initial: SystemSettingsInput
}

export function SettingsClient({ initial }: Props) {
  const [isSaving, setIsSaving] = useState(false)

  const form = useForm<SystemSettingsInput>({
    resolver: zodResolver(systemSettingsSchema),
    defaultValues: initial,
  })

  const { register, handleSubmit, watch, formState } = form
  const { errors } = formState
  const brandColor = watch('brandColorHex')

  const onSubmit = handleSubmit(async (data) => {
    setIsSaving(true)
    const result = await updateSystemSettings(data)
    setIsSaving(false)
    if ('error' in result) {
      toast({ title: 'Save failed', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: 'Settings saved' })
      form.reset(data)
    }
  })

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--color-accent-light)] flex items-center justify-center">
          <Settings className="h-5 w-5 text-[var(--color-accent)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Agency branding and proposal defaults
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col gap-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Branding
        </h2>

        <div>
          <Label htmlFor="agencyName" className="mb-1.5 block">
            Agency name
          </Label>
          <Input
            id="agencyName"
            {...register('agencyName')}
            aria-invalid={!!errors.agencyName}
            aria-describedby={errors.agencyName ? 'agencyName-error' : undefined}
          />
          {errors.agencyName && (
            <p id="agencyName-error" className="text-xs text-red-600 mt-1">
              {errors.agencyName.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="agencyLogoUrl" className="mb-1.5 block">
            Logo URL <span className="text-slate-400">(optional)</span>
          </Label>
          <Input
            id="agencyLogoUrl"
            placeholder="https://…"
            {...register('agencyLogoUrl')}
            aria-invalid={!!errors.agencyLogoUrl}
            aria-describedby={errors.agencyLogoUrl ? 'agencyLogoUrl-error' : undefined}
          />
          {errors.agencyLogoUrl && (
            <p id="agencyLogoUrl-error" className="text-xs text-red-600 mt-1">
              {errors.agencyLogoUrl.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="brandColorHex" className="mb-1.5 block">
            Brand color
          </Label>
          <div className="flex items-center gap-2">
            <span
              className="w-9 h-9 rounded-md border border-slate-200 shrink-0"
              style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(brandColor ?? '') ? brandColor : '#FFFFFF' }}
              aria-hidden="true"
            />
            <Input
              id="brandColorHex"
              className="w-[140px] font-mono"
              {...register('brandColorHex')}
              aria-invalid={!!errors.brandColorHex}
              aria-describedby={errors.brandColorHex ? 'brandColorHex-error' : undefined}
            />
          </div>
          {errors.brandColorHex && (
            <p id="brandColorHex-error" className="text-xs text-red-600 mt-1">
              {errors.brandColorHex.message}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col gap-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Proposal defaults
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="defaultValidityDays" className="mb-1.5 block">
              Validity (days)
            </Label>
            <Input
              id="defaultValidityDays"
              type="number"
              min={1}
              max={365}
              {...register('defaultValidityDays', { valueAsNumber: true })}
              aria-invalid={!!errors.defaultValidityDays}
              aria-describedby={errors.defaultValidityDays ? 'defaultValidityDays-error' : undefined}
            />
            {errors.defaultValidityDays && (
              <p id="defaultValidityDays-error" className="text-xs text-red-600 mt-1">
                {errors.defaultValidityDays.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="defaultCurrency" className="mb-1.5 block">
              Currency
            </Label>
            <Input
              id="defaultCurrency"
              maxLength={3}
              className="uppercase"
              {...register('defaultCurrency')}
              aria-invalid={!!errors.defaultCurrency}
              aria-describedby={errors.defaultCurrency ? 'defaultCurrency-error' : undefined}
            />
            {errors.defaultCurrency && (
              <p id="defaultCurrency-error" className="text-xs text-red-600 mt-1">
                {errors.defaultCurrency.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="defaultVatRate" className="mb-1.5 block">
              VAT rate (%)
            </Label>
            <Input
              id="defaultVatRate"
              type="number"
              min={0}
              max={100}
              step="0.01"
              {...register('defaultVatRate', { valueAsNumber: true })}
              aria-invalid={!!errors.defaultVatRate}
              aria-describedby={errors.defaultVatRate ? 'defaultVatRate-error' : undefined}
            />
            {errors.defaultVatRate && (
              <p id="defaultVatRate-error" className="text-xs text-red-600 mt-1">
                {errors.defaultVatRate.message}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={onSubmit}
          disabled={isSaving || !formState.isDirty}
          className="min-h-[44px] bg-[var(--color-accent)] hover:bg-indigo-700 text-white"
        >
          {isSaving ? 'Saving…' : 'Save settings'}
        </Button>
        {formState.isDirty && !isSaving && (
          <span className="text-xs text-slate-400">Unsaved changes</span>
        )}
      </div>
    </div>
  )
}
