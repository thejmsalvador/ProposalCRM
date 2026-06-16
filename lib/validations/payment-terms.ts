import { z } from 'zod'
import { paymentMilestoneSchema, cleanPaymentMilestones } from './proposals'
import { milestonesSumTo100 } from '../payment-schedule'

export const paymentTermSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    // Prose is now optional — the milestone schedule is the primary content.
    bodyRichText: z.string().default(''),
    milestones: z.array(paymentMilestoneSchema).default([]),
    isDefault: z.boolean().default(false),
  })
  .refine(
    (d) => {
      // A template's schedule is optional, but once any milestones are defined
      // they must cover the whole total (100%).
      const ms = cleanPaymentMilestones(d.milestones)
      return ms.length === 0 || milestonesSumTo100(ms)
    },
    {
      message: 'Payment schedule milestones must total 100%',
      path: ['milestones'],
    },
  )

export type PaymentTermInput = z.infer<typeof paymentTermSchema>
