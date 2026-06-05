import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'
import { loginAdmin } from '@/app/actions/auth'

export const metadata: Metadata = { title: 'Admin' }

export default function AdminLoginPage() {
  return (
    <AuthShell eyebrow="Staff" title="Admin access" subtitle="Enter the admin password to continue.">
      <LoginForm action={loginAdmin} variant="password" submitLabel="Enter admin" />
    </AuthShell>
  )
}
