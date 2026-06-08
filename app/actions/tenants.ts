'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Stripe from 'stripe'
import { createSession } from '@/lib/session'
import { requireRole } from '@/lib/dal'
import { createUser, isEmailTaken } from '@/lib/users'
import {
  createTenantApplication,
  getTenantByUserId,
  attachStripeCustomer,
  setFeeSession,
  setPaystub,
  type Person,
} from '@/lib/tenants'
import { getStripe, applicationTotalCents } from '@/lib/stripe'

export type TenantEnrollState =
  | { errors?: Record<string, string>; values?: Record<string, string>; message?: string }
  | undefined

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

function num(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parsePeople(json: string): Person[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((p) => p && typeof p.name === 'string' && typeof p.dob === 'string')
      .map((p) => ({ name: String(p.name).trim(), dob: String(p.dob).trim() }))
      .filter((p) => p.name && p.dob)
  } catch {
    return []
  }
}

async function startFeeCheckout(opts: { userId: string; email: string; customerId: string }): Promise<string> {
  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: opts.customerId,
    payment_method_types: ['us_bank_account', 'card'],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: applicationTotalCents(),
          product_data: { name: 'edynsgate application fee', description: '$25 application fee + processing' },
        },
      },
    ],
    payment_intent_data: {
      setup_future_usage: 'off_session', // save the method for future rent payments
      metadata: { userId: opts.userId },
    },
    metadata: { userId: opts.userId },
    success_url: `${baseUrl}/tenants/enroll/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/tenants/enroll?canceled=1`,
  })
  await setFeeSession(opts.userId, session.id)
  return session.url as string
}

export async function enrollTenant(_prev: TenantEnrollState, formData: FormData): Promise<TenantEnrollState> {
  const get = (k: string) => String(formData.get(k) ?? '').trim()

  const fields = [
    'name', 'email', 'phone', 'dob',
    'line1', 'line2', 'city', 'state', 'postalCode', 'country',
    'employer', 'jobTitle', 'monthlyIncome', 'employerPhone',
    'adults', 'children',
  ]
  const values: Record<string, string> = {}
  for (const f of fields) values[f] = get(f)
  const password = String(formData.get('password') ?? '')

  const errors: Record<string, string> = {}
  if (!values.name) errors.name = 'Enter the head of household’s name.'
  if (!values.email) errors.email = 'Enter an email.'
  else if (!emailRe.test(values.email)) errors.email = 'Enter a valid email.'
  if (!values.phone) errors.phone = 'Enter a phone number.'
  if (!values.dob) errors.dob = 'Enter the date of birth.'
  if (password.length < 8) errors.password = 'Password must be at least 8 characters.'
  if (!values.line1) errors.line1 = 'Enter the street address.'
  if (!values.city) errors.city = 'Enter the city.'
  if (!values.state) errors.state = 'Enter the state/region.'
  if (!values.postalCode) errors.postalCode = 'Enter the postal code.'
  if (!values.country) errors.country = 'Enter the country.'
  if (!values.employer) errors.employer = 'Enter the employer.'
  if (!values.jobTitle) errors.jobTitle = 'Enter the job title.'
  const monthlyIncome = num(values.monthlyIncome)
  if (monthlyIncome === null || monthlyIncome < 0) errors.monthlyIncome = 'Enter the monthly income.'

  const adults = parsePeople(values.adults)
  const children = parsePeople(values.children)

  if (Object.keys(errors).length > 0) return { errors, values }

  if (await isEmailTaken(values.email, 'tenant')) {
    return { errors: { email: 'A tenant account with this email already exists. Please sign in.' }, values }
  }

  let checkoutUrl: string
  try {
    const user = await createUser({ email: values.email, name: values.name, password, role: 'tenant' })

    await createTenantApplication(user.id, {
      name: values.name,
      email: values.email,
      phone: values.phone,
      dob: values.dob,
      address: {
        line1: values.line1,
        line2: values.line2 || undefined,
        city: values.city,
        state: values.state,
        postalCode: values.postalCode,
        country: values.country,
      },
      adults,
      children,
      employment: {
        employer: values.employer,
        jobTitle: values.jobTitle,
        monthlyIncome: monthlyIncome!,
        employerPhone: values.employerPhone || undefined,
      },
      feeAmountCents: applicationTotalCents(),
    })

    // Sign them in now so they can resume payment / see pending status even if they bail on Checkout.
    await createSession({ sub: user.id, role: 'tenant', name: user.name })

    const stripe = getStripe()
    const customer = await stripe.customers.create({
      email: values.email,
      name: values.name,
      phone: values.phone,
      metadata: { userId: user.id },
    })
    await attachStripeCustomer(user.id, customer.id)

    checkoutUrl = await startFeeCheckout({ userId: user.id, email: values.email, customerId: customer.id })
  } catch (e) {
    if (e instanceof Stripe.errors.StripeError) {
      return { message: 'Payment setup failed. Please try again.', values }
    }
    return { message: 'Something went wrong creating your application. Please try again.', values }
  }

  redirect(checkoutUrl) // external redirect to Stripe Checkout — keep outside try/catch
}

/** Re-start the application-fee checkout for a signed-in tenant who hasn't paid. */
export async function resumeApplicationPayment(): Promise<void> {
  const session = await requireRole('tenant', '/tenants/login')
  const tenant = await getTenantByUserId(session.sub)
  if (!tenant || tenant.fee.status === 'paid') redirect('/tenants')

  const stripe = getStripe()
  let customerId = tenant!.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: tenant!.email,
      name: tenant!.name,
      metadata: { userId: session.sub },
    })
    customerId = customer.id
    await attachStripeCustomer(session.sub, customerId)
  }

  const url = await startFeeCheckout({ userId: session.sub, email: tenant!.email, customerId })
  redirect(url)
}

/**
 * Save a manually uploaded paystub as an alternative to Plaid income verification.
 * Only available after the application is approved (the income-verification step).
 */
export async function savePaystub(url: string): Promise<{ error?: string } | void> {
  const session = await requireRole('tenant', '/tenants/login')
  const tenant = await getTenantByUserId(session.sub)
  if (!tenant) return { error: 'No application on file.' }
  if (tenant.status !== 'approved') return { error: 'Income verification unlocks once your application is approved.' }
  if (!/^https?:\/\/\S+$/.test(url)) return { error: 'That file could not be saved. Please try again.' }

  await setPaystub(session.sub, url)
  revalidatePath('/tenants')
}
