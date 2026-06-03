import { z } from 'zod'

export const tcTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  bodyRichText: z.string().min(1, 'Body is required'),
  categories: z.array(z.string()).default([]),
})

export type TcTemplateInput = z.infer<typeof tcTemplateSchema>
