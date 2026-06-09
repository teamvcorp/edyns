import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getSession } from '@/lib/session'

/**
 * Issues short-lived client upload tokens for a tenant's paystub (PDF or image),
 * but only to the signed-in tenant (or an admin acting on a paper application).
 * The browser uploads directly to Vercel Blob using the token.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await getSession()
        if (session?.role !== 'tenant' && session?.role !== 'admin') {
          throw new Error('Unauthorized')
        }
        return {
          allowedContentTypes: [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
            'image/heic',
            'image/heif',
          ],
          maximumSizeInBytes: 10 * 1024 * 1024, // 10MB
          addRandomSuffix: true,
        }
      },
      // Not invoked on localhost (no public callback URL). The URL is captured
      // client-side from the upload() return value instead.
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(json)
  } catch (error) {
    // Surface the real reason in Vercel logs (the client only sees a generic 400).
    console.error('[tenants/upload] handleUpload failed:', (error as Error).message)
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
