import { z } from 'zod'

// Unauthenticated "forgot password" request — just the email to send the
// recovery link to. The password rules for the actual reset live in
// changeOwnPasswordSchema (lib/validations/profile.ts), which the reset form
// reuses so there is a single source of truth for password strength.
export const requestPasswordResetSchema = z.object({
  email: z.string().email('Enter a valid email address'),
})

export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>
