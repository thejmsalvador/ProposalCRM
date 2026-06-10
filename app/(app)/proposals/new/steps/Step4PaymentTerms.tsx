'use client'

import { useWizard } from '../WizardContext'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RichTextEditor } from '@/components/ui/rich-text-editor-lazy'

export function Step4PaymentTerms() {
  const { form, paymentTemplates } = useWizard()
  const { setValue, watch } = form

  const selectedId = watch('paymentTemplateId')
  const override = watch('paymentTermsOverride')
  const isOverriding = override !== null

  const selectedTemplate = paymentTemplates.find((t) => t.id === selectedId)

  function handleTemplateChange(id: string) {
    setValue('paymentTemplateId', id)
    // Reset override when changing template
    setValue('paymentTermsOverride', null)
  }

  function toggleOverride(checked: boolean) {
    if (checked) {
      // Pre-fill override with template body
      setValue('paymentTermsOverride', selectedTemplate?.bodyRichText ?? '')
    } else {
      setValue('paymentTermsOverride', null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-primary)]">
          Payment Terms
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Select a payment terms template or customize for this proposal.
        </p>
      </div>

      {/* Template selector */}
      <div className="space-y-1.5">
        <Label htmlFor="paymentTemplate">Payment Template</Label>
        <Select value={selectedId} onValueChange={handleTemplateChange}>
          <SelectTrigger id="paymentTemplate">
            <SelectValue placeholder="Select payment terms..." />
          </SelectTrigger>
          <SelectContent>
            {paymentTemplates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
                {t.isDefault ? ' (Default)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Preview / Override */}
      {selectedTemplate && (
        <div className="space-y-4">
          {/* Override toggle */}
          <div className="flex items-center gap-3">
            <Switch
              id="paymentOverride"
              checked={isOverriding}
              onCheckedChange={toggleOverride}
            />
            <Label htmlFor="paymentOverride" className="text-sm">
              Override for this proposal
            </Label>
            {isOverriding && (
              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                Custom terms — deviation from standard
              </Badge>
            )}
          </div>

          {isOverriding ? (
            <div className="space-y-1.5">
              <Label htmlFor="paymentOverrideEditor">Custom Payment Terms</Label>
              <RichTextEditor
                value={override ?? ''}
                onChange={(html) => setValue('paymentTermsOverride', html)}
                placeholder="Edit payment terms..."
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Preview</Label>
              <div
                className="prose prose-sm max-w-none px-4 py-3 bg-slate-50 rounded-[var(--radius-sm)] border border-[var(--color-border)]"
                dangerouslySetInnerHTML={{ __html: selectedTemplate.bodyRichText }}
              />
            </div>
          )}
        </div>
      )}

      {!selectedId && (
        <div className="text-center py-8 border border-dashed border-[var(--color-border)] rounded-[var(--radius-md)]">
          <p className="text-sm text-[var(--color-muted)]">
            Select a payment terms template above to preview.
          </p>
        </div>
      )}
    </div>
  )
}
