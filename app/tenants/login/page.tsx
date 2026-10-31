import type { Metadata } from 'next'
import { redirectIfSignedIn } from '@/lib/dal'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'
import { Link } from '@/components/elements/link'
import { loginTenant } from '@/app/actions/auth'

export const metadata: Metadata = { title: 'Tenant log in' }

export default async function TenantLoginPage() {
  await redirectIfSignedIn('tenant', '/tenants')

  return (
    <AuthShell
      eyebrow="Tenants"
      title="Tenant log in"
      subtitle="Sign in to manage your tenancy and access support programs."
      footer={
        <>
          New here? <Link href="/tenants/enroll">Apply to the program</Link>
        </>
      }
    >
      <LoginForm action={loginTenant} submitLabel="Log in to tenant portal" />
    </AuthShell>
  )
}
