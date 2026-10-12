/**
 * Shared text-input / select / textarea styling, replacing per-form copies of
 * the same class string.
 *
 * `text-base` on phones is deliberate, not a typo: iOS Safari force-zooms the
 * page whenever a focused input's font-size is under 16px. 16px (`text-base`)
 * below the `sm:` breakpoint stops that; desktop keeps the compact 14px
 * (`sm:text-sm`). Keep any new form control at 16px+ on mobile.
 */
export const inputClass =
  'w-full rounded-lg bg-olive-950/5 px-3 py-2 text-base text-olive-950 outline-none ring-1 ring-olive-950/10 placeholder:text-olive-500 focus:ring-2 focus:ring-olive-950 sm:text-sm dark:bg-white/5 dark:text-white dark:ring-white/10 dark:placeholder:text-olive-400 dark:focus:ring-white'

/** Same look without `w-full`, for inline controls (filter bars, amount fields). */
export const inputClassInline =
  'rounded-lg bg-olive-950/5 px-3 py-2 text-base text-olive-950 outline-none ring-1 ring-olive-950/10 placeholder:text-olive-500 focus:ring-2 focus:ring-olive-950 sm:text-sm dark:bg-white/5 dark:text-white dark:ring-white/10 dark:placeholder:text-olive-400 dark:focus:ring-white'
