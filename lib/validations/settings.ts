import { z } from 'zod'

// No .default()/.coerce here — keeping input and output types identical
// avoids the zodResolver generic mismatch with react-hook-form.
export const systemSettingsSchema = z.object({
  agencyName: z.string().min(2, 'Agency name is required'),
  agencyLogoUrl: z.union([z.literal(''), z.string().url('Must be a valid URL')]),
  brandColorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex color, e.g. #214ADE'),
  defaultValidityDays: z
    .number({ message: 'Enter the number of days' })
    .int('Whole days only')
    .min(1, 'At least 1 day')
    .max(365, 'At most 365 days'),
  defaultCurrency: z
    .string()
    .length(3, 'Use a 3-letter currency code, e.g. PHP'),
  defaultVatRate: z
    .number({ message: 'Enter a VAT percentage' })
    .min(0, 'Cannot be negative')
    .max(100, 'Cannot exceed 100%'),
})

export type SystemSettingsInput = z.infer<typeof systemSettingsSchema>
