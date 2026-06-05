import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'
import { Link } from '@/components/elements/link'
import { loginPartner } from '@/app/actions/auth'

export const metadata: Metadata = { title: 'Partner log in' }

export default function PartnerLoginPage() {
  return (
    <AuthShell
      eyebrow="Property partners"
      title="Partner log in"
      subtitle="Sign in to manage your properties and tenant programs."
      footer={
        <>
          New partner? <Link href="/partners/enroll">Enroll</Link>
        </>
      }
    >
      <LoginForm action={loginPartner} submitLabel="Log in to partner portal" />
    </AuthShell>
  )
}
