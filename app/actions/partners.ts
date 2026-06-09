'use server'

import { redirect } from 'next/navigation'
import { createSession } from '@/lib/session'
import { isEmailTaken, registerPartner } from '@/lib/users'
import { rateLimit, getClientIp } from '@/lib/ratelimit'

// Account-creation throttle: cap new partner accounts per IP in a rolling window.
const SIGNUP_LIMIT = 5
const SIGNUP_WINDOW_MS = 60 * 60 * 1000

export type EnrollState =
  | {
      errors?: Record<string, string>
      values?: Record<string, string>
      message?: string
    }
  | undefined

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Fields we echo back so the form can repopulate on error (never the password).
const echoFields = [
  'name',
  'email',
  'phone',
  'line1',
  'line2',
  'city',
  'state',
  'postalCode',
  'country',
  'taxId',
] as const

export async function enrollPartner(_prev: EnrollState, formData: FormData): Promise<EnrollState> {
  const ip = await getClientIp()
  const { allowed } = await rateLimit({ key: `signup:partner:${ip}`, limit: SIGNUP_LIMIT, windowMs: SIGNUP_WINDOW_MS })
  if (!allowed) {
    return { message: 'Too many sign-ups from this network. Please try again later.' }
  }

  const get = (k: string) => String(formData.get(k) ?? '').trim()
  const values: Record<string, string> = {}
  for (const f of echoFields) values[f] = get(f)

  const password = String(formData.get('password') ?? '')
  const errors: Record<string, string> = {}

  if (!values.name) errors.name = 'Enter the partner’s full name.'
  if (!values.email) errors.email = 'Enter an email address.'
  else if (!emailRe.test(values.email)) errors.email = 'Enter a valid email address.'
  if (!values.phone) errors.phone = 'Enter a phone number.'
  if (password.length < 8) errors.password = 'Password must be at least 8 characters.'
  if (!values.line1) errors.line1 = 'Enter the street address.'
  if (!values.city) errors.city = 'Enter the city.'
  if (!values.state) errors.state = 'Enter the state/region.'
  if (!values.postalCode) errors.postalCode = 'Enter the postal code.'
  if (!values.country) errors.country = 'Enter the country.'
  if (!values.taxId) errors.taxId = 'Enter the tax ID (EIN or SSN).'

  if (Object.keys(errors).length > 0) {
    return { errors, values }
  }

  if (await isEmailTaken(values.email, 'partner')) {
    return { errors: { email: 'A partner account with this email already exists.' }, values }
  }

  let user
  try {
    user = await registerPartner({
      name: values.name,
      email: values.email,
      phone: values.phone,
      password,
      billingAddress: {
        line1: values.line1,
        line2: values.line2 || undefined,
        city: values.city,
        state: values.state,
        postalCode: values.postalCode,
        country: values.country,
      },
      taxId: values.taxId,
    })
  } catch {
    return { message: 'Something went wrong creating your account. Please try again.', values }
  }

  await createSession({ sub: user.id, role: 'partner', name: user.name })
  redirect('/partners') // throws NEXT_REDIRECT — keep outside try/catch
}
