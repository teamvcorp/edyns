import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'
import { loginPartner } from '@/app/actions/auth'

export const metadata: Metadata = { title: 'Partner log in' }

export default function PartnerLoginPage() {
  return (
    <AuthShell
      eyebrow="Property partners"
      title="Partner log in"
      subtitle="Sign in to manage your properties and tenant programs."
    >
      <LoginForm action={loginPartner} submitLabel="Log in to partner portal" />
    </AuthShell>
  )
}
