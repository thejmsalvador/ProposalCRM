'use client'

import { useEffect, useRef } from 'react'
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

export function Step5TermsConditions() {
  const { form, tcTemplates, services: catalogServices } = useWizard()
  const { setValue, watch } = form

  const selectedId = watch('tcTemplateId')
  const override = watch('tcOverride')
  const watchedLineItems = watch('lineItems')
  const isOverriding = override !== null

  const selectedTemplate = tcTemplates.find((t) => t.id === selectedId)
  const hasAutoSuggested = useRef(false)

  // Auto-suggest T&C template based on selected services' categories
  useEffect(() => {
    if (hasAutoSuggested.current || selectedId || tcTemplates.length === 0) return

    const lineItems = watchedLineItems ?? []
    // Collect categories from selected services
    const selectedServiceIds = lineItems
      .map((li) => li.serviceId)
      .filter(Boolean) as string[]
    const usedCategories = new Set(
      catalogServices
        .filter((s) => selectedServiceIds.includes(s.id))
        .map((s) => s.category),
    )

    if (usedCategories.size === 0) return

    // Find the template with the most overlapping categories
    let bestMatch = ''
    let bestScore = 0
    for (const tpl of tcTemplates) {
      const overlap = tpl.categories.filter((c) => usedCategories.has(c)).length
      if (overlap > bestScore) {
        bestScore = overlap
        bestMatch = tpl.id
      }
    }

    if (bestMatch) {
      setValue('tcTemplateId', bestMatch)
      hasAutoSuggested.current = true
    }
  }, [watchedLineItems, tcTemplates, catalogServices, selectedId, setValue])

  function handleTemplateChange(id: string) {
    setValue('tcTemplateId', id)
    setValue('tcOverride', null)
  }

  function toggleOverride(checked: boolean) {
    if (checked) {
      setValue('tcOverride', selectedTemplate?.bodyRichText ?? '')
    } else {
      setValue('tcOverride', null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-primary)]">
          Terms & Conditions
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Select or customize terms & conditions for this proposal.
        </p>
      </div>

      {/* Template selector */}
      <div className="space-y-1.5">
        <Label htmlFor="tcTemplate">T&C Template</Label>
        <Select value={selectedId} onValueChange={handleTemplateChange}>
          <SelectTrigger id="tcTemplate">
            <SelectValue placeholder="Select T&C template..." />
          </SelectTrigger>
          <SelectContent>
            {tcTemplates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
                {t.categories.length > 0 && (
                  <span className="text-[var(--color-muted)]">
                    {' '}
                    ({t.categories.join(', ')})
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Preview / Override */}
      {selectedTemplate && (
        <div className="space-y-4">
          {/* Categories */}
          {selectedTemplate.categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedTemplate.categories.map((cat) => (
                <Badge key={cat} variant="secondary" className="text-xs">
                  {cat}
                </Badge>
              ))}
            </div>
          )}

          {/* Override toggle */}
          <div className="flex items-center gap-3">
            <Switch
              id="tcOverride"
              checked={isOverriding}
              onCheckedChange={toggleOverride}
            />
            <Label htmlFor="tcOverride" className="text-sm">
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
              <Label htmlFor="tcOverrideEditor">Custom Terms & Conditions</Label>
              <RichTextEditor
                value={override ?? ''}
                onChange={(html) => setValue('tcOverride', html)}
                placeholder="Edit terms & conditions..."
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Preview</Label>
              <div
                className="prose prose-sm max-w-none px-4 py-3 bg-slate-50 rounded-[var(--radius-sm)] border border-[var(--color-border)] max-h-[400px] overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: selectedTemplate.bodyRichText }}
              />
            </div>
          )}
        </div>
      )}

      {!selectedId && (
        <div className="text-center py-8 border border-dashed border-[var(--color-border)] rounded-[var(--radius-md)]">
          <p className="text-sm text-[var(--color-muted)]">
            Select a T&C template above to preview. A template will be auto-suggested based on your selected services.
          </p>
        </div>
      )}
    </div>
  )
}
