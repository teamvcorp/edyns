'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/dal'
import { getTenantByUserId, setBilling } from '@/lib/tenants'
import { getStripe, COLLECTION_RATE } from '@/lib/stripe'

/**
 * Start recurring rent collection: a Stripe subscription that charges 40% of the
 * tenant's monthly income to their saved payment method.
 */
export async function startRentCollection(): Promise<void> {
  const session = await requireRole('tenant', '/tenants/login')
  const tenant = await getTenantByUserId(session.sub)
  if (!tenant) redirect('/tenants')

  if (tenant!.status !== 'approved') redirect('/tenants?error=not-approved')
  if (tenant!.billing?.status === 'active') redirect('/tenants')
  if (!tenant!.stripeCustomerId || !tenant!.defaultPaymentMethodId) redirect('/tenants?error=no-payment-method')

  const income = tenant!.employment.verifiedMonthlyIncome ?? tenant!.employment.monthlyIncome
  const monthlyAmountCents = Math.round(income * COLLECTION_RATE * 100)
  if (monthlyAmountCents <= 0) redirect('/tenants?error=no-income')

  const stripe = getStripe()
  const product = await stripe.products.create({
    name: 'edynsgate rent (Effort Exchange)',
    metadata: { userId: session.sub },
  })
  const price = await stripe.prices.create({
    currency: 'usd',
    unit_amount: monthlyAmountCents,
    recurring: { interval: 'month' },
    product: product.id,
  })
  const subscription = await stripe.subscriptions.create({
    customer: tenant!.stripeCustomerId!,
    items: [{ price: price.id }],
    default_payment_method: tenant!.defaultPaymentMethodId!,
    metadata: { userId: session.sub },
  })

  await setBilling(session.sub, {
    monthlyAmountCents,
    stripeSubscriptionId: subscription.id,
    status: subscription.status === 'active' ? 'active' : 'past_due',
    startedAt: new Date(),
  })

  revalidatePath('/tenants')
  redirect('/tenants?billing=started')
}
