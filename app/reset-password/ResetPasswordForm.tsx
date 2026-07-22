'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resetPassword } from '@/lib/actions/auth'
// Reuse the authenticated change-password rules so password strength stays
// defined in exactly one place.
import {
  changeOwnPasswordSchema,
  type ChangeOwnPasswordInput,
} from '@/lib/validations/profile'

export function ResetPasswordForm({ agencyName }: { agencyName: string }) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangeOwnPasswordInput>({
    resolver: zodResolver(changeOwnPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  })

  async function onSubmit(values: ChangeOwnPasswordInput) {
    setServerError(null)
    const result = await resetPassword(values)
    if ('error' in result) {
      setServerError(result.error)
      return
    }
    // Recovery session was signed out server-side; log in with the new password.
    router.push('/login?reset=success')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Agency branding */}
        <div className="mb-8 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            {agencyName}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Set a new password
          </h1>
        </div>

        {/* Card */}
        <div className="rounded-xl border bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            {/* Server error */}
            {serverError && (
              <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
                {serverError}
              </div>
            )}

            {/* New password */}
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                {...register('newPassword')}
                aria-invalid={!!errors.newPassword}
                aria-describedby={errors.newPassword ? 'newPassword-error' : undefined}
              />
              {errors.newPassword && (
                <p id="newPassword-error" className="text-xs text-red-600">
                  {errors.newPassword.message}
                </p>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                {...register('confirmPassword')}
                aria-invalid={!!errors.confirmPassword}
                aria-describedby={
                  errors.confirmPassword ? 'confirmPassword-error' : undefined
                }
              />
              {errors.confirmPassword && (
                <p id="confirmPassword-error" className="text-xs text-red-600">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            {/* Submit */}
            <Button type="submit" className="min-h-[44px] w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
