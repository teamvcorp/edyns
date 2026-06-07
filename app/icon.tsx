import { ImageResponse } from 'next/og'

// Browser favicon + Android/Chrome install icon (referenced by app/manifest.ts).
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

// Full-bleed olive tile with a centered wordmark initial. The generous padding
// keeps the glyph inside Android's maskable safe zone (center ~80%).
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#21201a',
          color: '#f4f3ed',
          fontFamily: 'serif',
          fontSize: 320,
          lineHeight: 1,
          paddingBottom: 40,
        }}
      >
        e
      </div>
    ),
    { ...size },
  )
}
