import { logout } from '@/app/actions/auth'
import { PlainButton } from '@/components/elements/button'
import type { ComponentProps } from 'react'

/** Posts to the logout server action. Safe to render in a Server Component. */
export function LogoutButton({
  size,
  className,
}: {
  size?: ComponentProps<typeof PlainButton>['size']
  className?: string
}) {
  return (
    <form action={logout} className={className}>
      <PlainButton type="submit" size={size} className={className && 'w-full'}>
        Log out
      </PlainButton>
    </form>
  )
}
