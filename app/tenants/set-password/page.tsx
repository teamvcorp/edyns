import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { SetPasswordForm } from '@/components/auth/set-password-form'
import { requireRole } from '@/lib/dal'

export const metadata: Metadata = { title: 'Set a new password' }

export default async function TenantSetPasswordPage() {
  const session = await requireRole('tenant', '/tenants/login')

  return (
    <AuthShell
      eyebrow="Tenants"
      title="Set a new password"
      subtitle={
        session.mustReset
          ? 'You’re signed in with a temporary password. Choose a new one to continue.'
          : 'Choose a new password for your account.'
      }
    >
      <SetPasswordForm />
    </AuthShell>
  )
}
