import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getSession } from '@/lib/session'

/**
 * Issues short-lived client upload tokens for property images, but only to a
 * signed-in property partner. The browser uploads directly to Vercel Blob using
 * the token (keeps large files off the server action body limit).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await getSession()
        if (session?.role !== 'partner' && session?.role !== 'admin') {
          throw new Error('Unauthorized')
        }
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          maximumSizeInBytes: 10 * 1024 * 1024, // 10MB per image
          addRandomSuffix: true,
        }
      },
      // Note: not invoked on localhost (no public callback URL). We capture the
      // resulting URL client-side from the upload() return value instead.
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(json)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
