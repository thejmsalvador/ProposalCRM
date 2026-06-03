import { z } from 'zod'

export const serviceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.string().min(1, 'Category is required'),
  description: z.string().min(1, 'Description is required'),
  defaultScope: z.string().min(1, 'Default scope of work is required'),
  unit: z.string().min(1, 'Unit is required'),
  defaultRate: z
    .number({ message: 'Default rate must be a number' })
    .min(0, 'Default rate must be 0 or more'),
  minRate: z
    .number({ message: 'Min rate must be a number' })
    .min(0)
    .optional()
    .nullable(),
  maxRate: z
    .number({ message: 'Max rate must be a number' })
    .min(0)
    .optional()
    .nullable(),
  paymentTplId: z.string().optional().nullable(),
  tcTemplateId: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
})

export type ServiceInput = z.infer<typeof serviceSchema>
