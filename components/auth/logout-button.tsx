import { logout } from '@/app/actions/auth'
import { PlainButton } from '@/components/elements/button'

/** Posts to the logout server action. Safe to render in a Server Component. */
export function LogoutButton() {
  return (
    <form action={logout}>
      <PlainButton type="submit">Log out</PlainButton>
    </form>
  )
}
