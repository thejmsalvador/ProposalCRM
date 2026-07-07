'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { User } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { updateOwnProfile } from '@/lib/actions/users'
import { changeOwnPassword } from '@/lib/actions/auth'
import {
  updateOwnProfileSchema,
  changeOwnPasswordSchema,
  type UpdateOwnProfileInput,
  type ChangeOwnPasswordInput,
} from '@/lib/validations/profile'

const MAX_IMAGE_BYTES = 500 * 1024 // 500 KB — same cap as EditUserSheet's signature upload

type Props = {
  initial: {
    name: string
    email: string
    jobTitle: string
    signatureImageUrl: string
    avatarUrl: string
  }
}

// Reads a chosen image file as a data URI, enforcing type + 500KB cap.
// Mirrors EditUserSheet's handleSignatureFile so avatar/signature behave identically.
function readImageAsDataUri(
  file: File,
  onLoaded: (dataUri: string) => void,
): void {
  if (!file.type.startsWith('image/')) {
    toast({
      title: 'Invalid file',
      description: 'Choose an image file (PNG or JPG).',
      variant: 'destructive',
    })
    return
  }
  if (file.size > MAX_IMAGE_BYTES) {
    toast({
      title: 'Image too large',
      description: 'Image must be under 500 KB.',
      variant: 'destructive',
    })
    return
  }
  const reader = new FileReader()
  reader.onload = () => onLoaded(String(reader.result))
  reader.readAsDataURL(file)
}

export function ProfileClient({ initial }: Props) {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--color-accent-light)] flex items-center justify-center">
          <User className="h-5 w-5 text-[var(--color-accent)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage your account details and password
          </p>
        </div>
      </div>

      <ProfileInfoSection initial={initial} />
      <PasswordSection />
    </div>
  )
}

function ProfileInfoSection({ initial }: Props) {
  const [isSaving, setIsSaving] = useState(false)

  const form = useForm<UpdateOwnProfileInput>({
    resolver: zodResolver(updateOwnProfileSchema),
    defaultValues: {
      name: initial.name,
      jobTitle: initial.jobTitle,
      signatureImageUrl: initial.signatureImageUrl,
      avatarUrl: initial.avatarUrl,
    },
  })

  const { register, handleSubmit, watch, setValue, formState } = form
  const { errors, isDirty } = formState

  const avatarUrl = watch('avatarUrl')
  const signatureImageUrl = watch('signatureImageUrl')
  const nameValue = watch('name')

  function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = ''
    if (!file) return
    readImageAsDataUri(file, (dataUri) =>
      setValue('avatarUrl', dataUri, { shouldDirty: true }),
    )
  }

  function handleSignatureFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = ''
    if (!file) return
    readImageAsDataUri(file, (dataUri) =>
      setValue('signatureImageUrl', dataUri, { shouldDirty: true }),
    )
  }

  const onSubmit = handleSubmit(async (data) => {
    setIsSaving(true)
    const result = await updateOwnProfile(data)
    setIsSaving(false)
    if ('error' in result) {
      toast({ title: 'Save failed', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: 'Profile saved' })
      form.reset(data)
    }
  })

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col gap-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Profile details
      </h2>

      {/* Email — read-only, informational */}
      <div>
        <Label htmlFor="profile-email" className="mb-1.5 block">
          Email
        </Label>
        <Input id="profile-email" value={initial.email} disabled readOnly />
        <p className="text-xs text-[var(--color-muted)] mt-1">
          Contact a Super Admin to change your email address.
        </p>
      </div>

      {/* Avatar */}
      <div className="space-y-1.5">
        <Label htmlFor="profile-avatar">Avatar</Label>
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={avatarUrl || undefined} alt={`${nameValue || 'Your'} avatar`} />
            <AvatarFallback className="bg-[var(--color-accent)] text-white text-lg font-semibold">
              {(nameValue || initial.name || '?').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <Input
              id="profile-avatar"
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleAvatarFile}
              className="cursor-pointer min-h-[44px]"
            />
            {avatarUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start min-h-[44px]"
                onClick={() => setValue('avatarUrl', '', { shouldDirty: true })}
              >
                Remove avatar
              </Button>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-[var(--color-muted)]">PNG or JPG, under 500&nbsp;KB.</p>
      </div>

      {/* Name */}
      <div>
        <Label htmlFor="profile-name" className="mb-1.5 block">
          Full name
        </Label>
        <Input
          id="profile-name"
          {...register('name')}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'profile-name-error' : undefined}
        />
        {errors.name && (
          <p id="profile-name-error" className="text-xs text-[var(--color-danger)] mt-1">
            {errors.name.message}
          </p>
        )}
      </div>

      {/* Job title */}
      <div>
        <Label htmlFor="profile-job-title" className="mb-1.5 block">
          Job title
        </Label>
        <Input
          id="profile-job-title"
          placeholder="e.g. Account Executive"
          {...register('jobTitle')}
          aria-invalid={!!errors.jobTitle}
          aria-describedby={errors.jobTitle ? 'profile-job-title-error' : undefined}
        />
        {errors.jobTitle && (
          <p id="profile-job-title-error" className="text-xs text-[var(--color-danger)] mt-1">
            {errors.jobTitle.message}
          </p>
        )}
      </div>

      {/* Signature image */}
      <div className="space-y-1.5">
        <Label htmlFor="profile-signature">Signature image</Label>
        <p className="text-xs text-[var(--color-muted)]">
          Shown on approved proposal PDFs for sign-off (e.g. COO/CEO). PNG or JPG,
          under 500&nbsp;KB.
        </p>
        {signatureImageUrl ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signatureImageUrl}
              alt={`${nameValue || 'Your'} signature`}
              className="h-16 w-auto max-w-[200px] rounded border border-[var(--color-border)] bg-white object-contain p-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[44px]"
              onClick={() => setValue('signatureImageUrl', '', { shouldDirty: true })}
            >
              Remove
            </Button>
          </div>
        ) : null}
        <Input
          id="profile-signature"
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleSignatureFile}
          className="cursor-pointer min-h-[44px]"
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button
          onClick={onSubmit}
          disabled={isSaving || !isDirty}
          className="min-h-[44px] bg-[var(--color-accent)] hover:bg-indigo-700 text-white"
        >
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
        {isDirty && !isSaving && (
          <span className="text-xs text-slate-400">Unsaved changes</span>
        )}
      </div>
    </div>
  )
}

function PasswordSection() {
  const [isSaving, setIsSaving] = useState(false)

  const form = useForm<ChangeOwnPasswordInput>({
    resolver: zodResolver(changeOwnPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  })

  const { register, handleSubmit, formState, reset } = form
  const { errors } = formState

  const onSubmit = handleSubmit(async (data) => {
    setIsSaving(true)
    const result = await changeOwnPassword(data)
    setIsSaving(false)
    if ('error' in result) {
      toast({ title: 'Password change failed', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: 'Password updated' })
      reset({ newPassword: '', confirmPassword: '' })
    }
  })

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col gap-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Change password
      </h2>

      <div>
        <Label htmlFor="profile-new-password" className="mb-1.5 block">
          New password
        </Label>
        <Input
          id="profile-new-password"
          type="password"
          autoComplete="new-password"
          {...register('newPassword')}
          aria-invalid={!!errors.newPassword}
          aria-describedby={errors.newPassword ? 'profile-new-password-error' : undefined}
        />
        {errors.newPassword && (
          <p id="profile-new-password-error" className="text-xs text-[var(--color-danger)] mt-1">
            {errors.newPassword.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="profile-confirm-password" className="mb-1.5 block">
          Confirm new password
        </Label>
        <Input
          id="profile-confirm-password"
          type="password"
          autoComplete="new-password"
          {...register('confirmPassword')}
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={errors.confirmPassword ? 'profile-confirm-password-error' : undefined}
        />
        {errors.confirmPassword && (
          <p id="profile-confirm-password-error" className="text-xs text-[var(--color-danger)] mt-1">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button
          onClick={onSubmit}
          disabled={isSaving}
          className="min-h-[44px] bg-[var(--color-accent)] hover:bg-indigo-700 text-white"
        >
          {isSaving ? 'Updating…' : 'Update password'}
        </Button>
      </div>
    </div>
  )
}
