'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm, Controller, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, RotateCcw, Plus, X, Lock } from 'lucide-react'
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
import { RichTextEditor } from '@/components/ui/rich-text-editor-lazy'
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
  existingCategories: string[]
}

export function TcTemplateDialog({
  open,
  onOpenChange,
  template,
  serviceCategories,
  existingCategories,
}: Props) {
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
    // Cast: the schema's .default() makes zod's input type looser than its
    // output, but the form always supplies complete defaultValues
    resolver: zodResolver(tcTemplateSchema) as Resolver<TcTemplateInput>,
    defaultValues: { name: '', bodyRichText: '', categories: [] },
  })

  const selectedCategories = watch('categories')
  const [newCategory, setNewCategory] = useState('')

  // Suggestions = service categories + categories already used across sections,
  // minus the ones already selected on this template.
  const suggestions = Array.from(
    new Set([...serviceCategories, ...existingCategories]),
  )
    .filter((c) => !(selectedCategories ?? []).includes(c))
    .sort((a, b) => a.localeCompare(b))

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

  function addCategory() {
    const value = newCategory.trim()
    if (!value) return
    const current = selectedCategories ?? []
    if (!current.some((c) => c.toLowerCase() === value.toLowerCase())) {
      setValue('categories', [...current, value], { shouldValidate: true })
    }
    setNewCategory('')
  }

  function removeCategory(cat: string) {
    setValue(
      'categories',
      (selectedCategories ?? []).filter((c) => c !== cat),
      { shouldValidate: true },
    )
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
          <SheetTitle>{isEdit ? 'Edit T&C Section' : 'Add T&C Section'}</SheetTitle>
          <SheetDescription>
            {isLocked
              ? 'This section is locked. Duplicate it to create an editable copy.'
              : isEdit
              ? 'Update the section. Existing proposals referencing it are unaffected.'
              : 'Create a new reusable terms & conditions section.'}
          </SheetDescription>

          {isEdit && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  template!.isArchived
                    ? 'bg-slate-100 text-slate-500'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {template!.isArchived ? 'Archived' : 'Active'}
              </span>
              {isLocked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                  <Lock size={10} aria-hidden="true" />
                  Locked
                </span>
              )}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="tc-name">Section title *</Label>
            <Input
              id="tc-name"
              {...register('name')}
              placeholder="e.g. Revision Policy"
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
              Used to group and filter sections in the proposal wizard, and to auto-suggest
              sections when the selected services match these categories.
            </p>

            {/* Selected categories as removable chips */}
            {(selectedCategories ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(selectedCategories ?? []).map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full text-xs font-medium bg-[var(--color-accent)] text-white"
                  >
                    {cat}
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => removeCategory(cat)}
                        aria-label={`Remove ${cat}`}
                        className="rounded-full p-0.5 hover:bg-white/20"
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Add a brand-new category */}
            {!isLocked && (
              <div className="flex gap-2">
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCategory()
                    }
                  }}
                  placeholder="Add a category, e.g. Revision Policies"
                  aria-label="New category"
                  className="h-9"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 shrink-0"
                  onClick={addCategory}
                  disabled={!newCategory.trim()}
                >
                  <Plus size={14} aria-hidden="true" />
                  Add
                </Button>
              </div>
            )}

            {/* Suggestions */}
            {!isLocked && suggestions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
                  Suggestions
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border bg-white border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors min-h-[32px]"
                    >
                      + {cat}
                    </button>
                  ))}
                </div>
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
