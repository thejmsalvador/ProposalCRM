import { z } from 'zod'

export const ENGAGEMENT_TYPES = [
  { value: 'one-time', label: 'One-time' },
  { value: 'monthly', label: 'Monthly' },
] as const

export type EngagementType = (typeof ENGAGEMENT_TYPES)[number]['value']

/** Display label for an engagement type; legacy free-text units pass through as-is. */
export function engagementLabel(unit: string): string {
  return ENGAGEMENT_TYPES.find((t) => t.value === unit)?.label ?? unit
}

export const CURRENCIES = ['PHP', 'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'HKD', 'AUD', 'AED'] as const

export const expenseItemSchema = z.object({
  label: z.string().min(1, 'Expense label is required'),
  amount: z
    .number({ message: 'Expense amount must be a number' })
    .min(0, 'Expense amount must be 0 or more'),
})

export type ExpenseItem = z.infer<typeof expenseItemSchema>

export const serviceSchema = z.object({
  name: z.string().min(1, 'Service name is required'),
  category: z.string().min(1, 'Service category is required'),
  description: z.string().min(1, 'Description is required'),
  defaultScope: z.string().min(1, 'Default scope of work is required'),
  unit: z.enum(['one-time', 'monthly'], { message: 'Engagement type is required' }),
  engagementTerm: z
    .number({ message: 'Engagement term must be a number' })
    .int('Engagement term must be a whole number')
    .min(1, 'Engagement term must be at least 1'),
  defaultRate: z
    .number({ message: 'Item cost must be a number' })
    .min(0, 'Item cost must be 0 or more'),
  estimatedExpenses: z.array(expenseItemSchema).optional(),
  paymentTplId: z.string().optional().nullable(),
  tcTemplateId: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
})

export type ServiceInput = z.infer<typeof serviceSchema>
