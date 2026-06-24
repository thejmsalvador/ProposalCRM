import { z } from 'zod'

// A company bank account / "mode of payment" in the library. Branch and SWIFT
// code are optional (local accounts often omit SWIFT). The label groups/names the
// account, e.g. "Foreign Clients (BDO)" or "Filinvest (EastWest)".
export const modeOfPaymentSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  bankName: z.string().min(1, 'Bank name is required'),
  accountName: z.string().min(1, 'Account name is required'),
  accountNumber: z.string().min(1, 'Account number is required'),
  branch: z.string().default(''),
  swiftCode: z.string().default(''),
})

export type ModeOfPaymentInput = z.infer<typeof modeOfPaymentSchema>
