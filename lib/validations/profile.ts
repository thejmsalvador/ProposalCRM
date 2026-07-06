import { z } from 'zod'

// Self-service profile edit (name, job title, signature image, avatar).
// Deliberately excludes role/team/isActive/defaultApproverId — those remain
// SUPER_ADMIN-only via lib/actions/users.ts#updateUser.
export const updateOwnProfileSchema = z.object({
  name: z.string().min(2, 'Full name is required'),
  jobTitle: z.string().optional(),
  // Data URI, ≤500KB — same convention as the signature image (see EditUserSheet).
  signatureImageUrl: z.string().optional(),
  avatarUrl: z.string().optional(),
})

export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>

export const changeOwnPasswordSchema = z
  .object({
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordSchema>
