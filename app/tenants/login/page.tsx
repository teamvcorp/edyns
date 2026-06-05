import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'
import { loginTenant } from '@/app/actions/auth'

export const metadata: Metadata = { title: 'Tenant log in' }

export default function TenantLoginPage() {
  return (
    <AuthShell
      eyebrow="Tenants"
      title="Tenant log in"
      subtitle="Sign in to manage your tenancy and access support programs."
    >
      <LoginForm action={loginTenant} submitLabel="Log in to tenant portal" />
    </AuthShell>
  )
}
