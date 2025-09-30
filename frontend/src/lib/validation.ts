import { z } from 'zod'

export const emailSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .max(255, 'Email is too long')
})

export const unsubscribeSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
})

export type EmailFormData = z.infer<typeof emailSchema>
export type UnsubscribeFormData = z.infer<typeof unsubscribeSchema>
