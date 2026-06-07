import type { MetadataRoute } from 'next'

/**
 * Web App Manifest — makes edynsgate installable on Android/Chrome
 * ("Install app") and gives it a proper home-screen identity. iOS uses the
 * apple-icon + appleWebApp metadata instead (see app/apple-icon.tsx + layout).
 *
 * Icons are served by the generated routes (app/icon.tsx is a full-bleed
 * olive tile, safe for Android's maskable crop).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'edynsgate — housing, education, sustainability, equality',
    short_name: 'edynsgate',
    description:
      'A life systems company building housing, education, sustainability, and equality as one connected system.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#21201a',
    theme_color: '#21201a',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
