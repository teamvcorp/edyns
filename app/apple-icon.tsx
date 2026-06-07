import { ImageResponse } from 'next/og'

// iOS "Add to Home Screen" icon (apple-touch-icon). iOS applies its own
// rounded mask, so we render a full-bleed olive tile with the wordmark initial.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
          fontSize: 120,
          lineHeight: 1,
          paddingBottom: 14,
        }}
      >
        e
      </div>
    ),
    { ...size },
  )
}
