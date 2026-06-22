import { z } from 'zod'
import { paymentMilestoneSchema, cleanPaymentMilestones } from './proposals'
import { milestonesValidForBasis } from '../payment-schedule'

export const paymentTermSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    // Prose is now optional — the milestone schedule is the primary content.
    bodyRichText: z.string().default(''),
    milestones: z.array(paymentMilestoneSchema).default([]),
    // How the schedule's percentages are calculated. See MilestoneBasis.
    milestoneBasis: z.enum(['total', 'remaining']).default('total'),
    isDefault: z.boolean().default(false),
  })
  .refine(
    (d) => {
      // A template's schedule is optional, but once milestones are defined they
      // must fully bill the total under the selected basis.
      const ms = cleanPaymentMilestones(d.milestones)
      return milestonesValidForBasis(ms, d.milestoneBasis)
    },
    {
      message: 'Payment schedule milestones do not fully bill the total for the selected basis',
      path: ['milestones'],
    },
  )

export type PaymentTermInput = z.infer<typeof paymentTermSchema>
