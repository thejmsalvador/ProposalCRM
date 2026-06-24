'use client'

import { useFieldArray } from 'react-hook-form'
import { useWizard } from '../WizardContext'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PenLine, Plus, Trash2, UserPlus } from 'lucide-react'

export function Step6Signatories() {
  const { form } = useWizard()
  const {
    register,
    control,
    formState: { errors },
  } = form
  const { fields, append, remove } = useFieldArray({ control, name: 'signatories' })

  function addSignatory() {
    append({ id: '', name: '', position: '', companyName: '' })
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-primary)]">Signatories</h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Who will sign this proposal on the client&apos;s side. Each one appears in the
          &ldquo;Conforme&rdquo; block of the PDF with space to sign by hand. Your internal
          approvers (COO and CEO) are added automatically once the proposal is approved.
        </p>
      </div>

      {/* Helper note */}
      <div className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <PenLine size={16} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
        <p className="text-xs text-[var(--color-muted)]">
          Add at least one signatory. The client signs the printed PDF off-platform, so no
          signature is uploaded here — a blank signature line is rendered above each name.
        </p>
      </div>

      {fields.length === 0 ? (
        // Empty state with a primary CTA (a11y: never leave it blank)
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[var(--color-accent)]">
            <UserPlus size={22} />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--color-primary)]">No signatories yet</p>
            <p className="text-xs text-[var(--color-muted)]">
              Add the client-side people who will sign this proposal.
            </p>
          </div>
          <Button
            type="button"
            onClick={addSignatory}
            className="min-h-[44px] bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/90"
          >
            <Plus size={16} className="mr-1" />
            Add your first signatory
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-4 sm:p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-primary)]">
                  Signatory {index + 1}
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(index)}
                  aria-label={`Remove signatory ${index + 1}`}
                  className="min-h-[44px] min-w-[44px] text-[var(--color-muted)] hover:text-[var(--color-danger)]"
                >
                  <Trash2 size={16} />
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`signatory-name-${index}`}>Name</Label>
                  <Input
                    id={`signatory-name-${index}`}
                    placeholder="e.g. Maria Santos"
                    {...register(`signatories.${index}.name` as const)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`signatory-position-${index}`}>Position</Label>
                  <Input
                    id={`signatory-position-${index}`}
                    placeholder="e.g. Head of Operations"
                    {...register(`signatories.${index}.position` as const)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`signatory-company-${index}`}>Company name</Label>
                  <Input
                    id={`signatory-company-${index}`}
                    placeholder="e.g. Acme Corporation"
                    {...register(`signatories.${index}.companyName` as const)}
                  />
                </div>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={addSignatory}
            className="min-h-[44px] w-full sm:w-auto"
          >
            <Plus size={16} className="mr-1" />
            Add signatory
          </Button>
        </div>
      )}

      {errors.signatories?.message && (
        <p className="text-xs text-[var(--color-danger)]">
          {String(errors.signatories.message)}
        </p>
      )}
    </div>
  )
}
