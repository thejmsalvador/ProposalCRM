import { z } from 'zod'

export const inviteUserSchema = z.object({
  name: z.string().min(2, 'Full name is required'),
  email: z.string().email('Valid email address required'),
  role: z.enum(['SALES_EXEC', 'SALES_MANAGER', 'COO', 'CEO', 'ADMIN']),
  jobTitle: z.string().optional(),
  teamId: z.string().optional(),
})

export type InviteUserInput = z.infer<typeof inviteUserSchema>

export const updateUserSchema = z.object({
  name: z.string().min(2, 'Full name is required'),
  jobTitle: z.string().optional(),
  role: z.enum(['SALES_EXEC', 'SALES_MANAGER', 'COO', 'CEO', 'ADMIN', 'SUPER_ADMIN']),
  teamId: z.string().optional(),
  defaultApproverId: z.string().optional(),
  // Sign-off signature image stored as a data URI (or empty to clear). Shown on
  // approved proposal PDFs for internal approvers (COO/CEO).
  signatureImageUrl: z.string().optional(),
  isActive: z.boolean(),
})

export type UpdateUserInput = z.infer<typeof updateUserSchema>

export const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required'),
  managerId: z.string().optional(),
})

export type CreateTeamInput = z.infer<typeof createTeamSchema>
