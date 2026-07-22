'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestPasswordReset } from '@/lib/actions/auth'
import {
  requestPasswordResetSchema,
  type RequestPasswordResetInput,
} from '@/lib/validations/auth'

export function ForgotPasswordForm({
  agencyName,
  initialError = null,
}: {
  agencyName: string
  initialError?: string | null
}) {
  // Once submitted we hold the email so the confirmation screen can echo it.
  const [sentTo, setSentTo] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestPasswordResetInput>({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values: RequestPasswordResetInput) {
    // requestPasswordReset never reveals whether the address is registered, so
    // there is no error branch — we always advance to the confirmation screen.
    await requestPasswordReset(values.email)
    setSentTo(values.email.trim())
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
            {sentTo ? 'Check your email' : 'Reset your password'}
          </h1>
        </div>

        {/* Card */}
        <div className="rounded-xl border bg-white p-8 shadow-sm">
          {sentTo ? (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                If an account exists for{' '}
                <span className="font-medium text-foreground">{sentTo}</span>, we&apos;ve
                sent a link to reset your password. It expires shortly and can be used
                once.
              </p>
              <p className="text-sm text-muted-foreground">
                Don&apos;t see it? Check your spam folder, and open the link on this same
                device and browser.
              </p>
              <div className="flex flex-col gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] w-full"
                  onClick={() => setSentTo(null)}
                >
                  Use a different email
                </Button>
                <Link
                  href="/login"
                  className="text-center text-sm font-medium text-[var(--color-accent)] hover:underline"
                >
                  Back to sign in
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
              {initialError && (
                <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
                  {initialError}
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                Enter the email tied to your account and we&apos;ll send you a link to
                set a new password.
              </p>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@agency.com"
                  {...register('email')}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                />
                {errors.email && (
                  <p id="email-error" className="text-xs text-red-600">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="min-h-[44px] w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Sending…' : 'Send reset link'}
              </Button>

              <p className="text-center text-sm">
                <Link
                  href="/login"
                  className="font-medium text-[var(--color-accent)] hover:underline"
                >
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
