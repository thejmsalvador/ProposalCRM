import { z } from 'zod'

export const paymentTermSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  bodyRichText: z.string().min(1, 'Body is required'),
  isDefault: z.boolean().default(false),
})

export type PaymentTermInput = z.infer<typeof paymentTermSchema>
