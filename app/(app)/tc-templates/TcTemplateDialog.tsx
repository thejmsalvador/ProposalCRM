'use client'

import { useEffect, useTransition } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, RotateCcw } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { tcTemplateSchema, type TcTemplateInput } from '@/lib/validations/tc-templates'
import {
  createTcTemplate,
  updateTcTemplate,
  archiveTcTemplate,
  restoreTcTemplate,
} from '@/lib/actions/tc-templates'
import type { TcTemplateListItem } from '@/lib/actions/tc-templates'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: TcTemplateListItem | null
  serviceCategories: string[]
}

export function TcTemplateDialog({ open, onOpenChange, template, serviceCategories }: Props) {
  const isEdit = !!template
  const isLocked = template?.isLocked ?? false
  const [, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TcTemplateInput>({
    resolver: zodResolver(tcTemplateSchema),
    defaultValues: { name: '', bodyRichText: '', categories: [] },
  })

  const selectedCategories = watch('categories')

  useEffect(() => {
    if (open) {
      reset(
        template
          ? { name: template.name, bodyRichText: template.bodyRichText, categories: template.categories }
          : { name: '', bodyRichText: '', categories: [] },
      )
    }
  }, [open, template, reset])

  function toggleCategory(cat: string) {
    const current = selectedCategories ?? []
    if (current.includes(cat)) {
      setValue('categories', current.filter((c) => c !== cat), { shouldValidate: true })
    } else {
      setValue('categories', [...current, cat], { shouldValidate: true })
    }
  }

  async function onSubmit(data: TcTemplateInput) {
    const result = isEdit
      ? await updateTcTemplate(template!.id, data)
      : await createTcTemplate(data)

    if ('error' in result) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: isEdit ? 'Template updated' : 'Template created' })
      onOpenChange(false)
    }
  }

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveTcTemplate(template!.id)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Template archived' })
        onOpenChange(false)
      }
    })
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreTcTemplate(template!.id)
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Template restored' })
        onOpenChange(false)
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-6 py-5 border-b border-[var(--color-border)] shrink-0">
          <SheetTitle>{isEdit ? 'Edit T&C Template' : 'Add T&C Template'}</SheetTitle>
          <SheetDescription>
            {isLocked
              ? 'This template is locked. Duplicate it to create an editable copy.'
              : isEdit
              ? 'Update the template. Existing proposals referencing it are unaffected.'
              : 'Create a new reusable terms & conditions template.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="tc-name">Name *</Label>
            <Input
              id="tc-name"
              {...register('name')}
              placeholder="e.g. Standard Digital Services T&C"
              disabled={isLocked}
            />
            {errors.name && (
              <p className="text-xs text-[var(--color-danger)]">{errors.name.message}</p>
            )}
          </div>

          {/* Associated categories */}
          <div className="space-y-2">
            <Label>Associated categories</Label>
            <p className="text-xs text-[var(--color-muted)]">
              Auto-suggests this template in the proposal wizard when the selected services match
              these categories.
            </p>
            {serviceCategories.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)] italic">
                No service categories found. Add services to the catalog first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {serviceCategories.map((cat) => {
                  const checked = (selectedCategories ?? []).includes(cat)
                  return (
                    <button
                      key={cat}
                      type="button"
                      disabled={isLocked}
                      onClick={() => toggleCategory(cat)}
                      aria-pressed={checked}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors min-h-[32px] ${
                        checked
                          ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
                          : 'bg-white border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
                      } disabled:opacity-50 disabled:pointer-events-none`}
                    >
                      {cat}
                    </button>
                  )
                })}
              </div>
            )}
            {errors.categories && (
              <p className="text-xs text-[var(--color-danger)]">{errors.categories.message}</p>
            )}
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label htmlFor="tc-body">Terms & Conditions *</Label>
            <p className="text-xs text-[var(--color-muted)]">
              Rich text — supports bold, italic, bullet lists.
            </p>
            <Controller
              name="bodyRichText"
              control={control}
              render={({ field }) => (
                <RichTextEditor
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Enter your terms and conditions…"
                  disabled={isLocked}
                />
              )}
            />
            {errors.bodyRichText && (
              <p className="text-xs text-[var(--color-danger)]">{errors.bodyRichText.message}</p>
            )}
          </div>
        </div>

        <SheetFooter className="px-6 py-4 border-t border-[var(--color-border)] shrink-0 flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
          {isEdit && !isLocked && (
            <div>
              {!template!.isArchived ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-[var(--color-danger)] hover:bg-red-50 min-h-[44px]"
                  onClick={handleArchive}
                >
                  <Archive size={14} />
                  Archive
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-[var(--color-success)] hover:bg-green-50 min-h-[44px]"
                  onClick={handleRestore}
                >
                  <RotateCcw size={14} />
                  Restore
                </Button>
              )}
            </div>
          )}

          <div className="flex gap-2 sm:ml-auto">
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => onOpenChange(false)}
            >
              {isLocked ? 'Close' : 'Cancel'}
            </Button>
            {!isLocked && (
              <Button
                type="button"
                className="min-h-[44px]"
                disabled={isSubmitting}
                onClick={handleSubmit(onSubmit)}
              >
                {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create template'}
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
