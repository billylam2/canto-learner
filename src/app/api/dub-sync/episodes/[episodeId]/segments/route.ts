import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { createSegment } from '@/lib/db/dub-sync'
import { readAdminSession } from '@/lib/auth/admin-session'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
): Promise<NextResponse> {
  const session = await readAdminSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { episodeId } = await params
  const body = await request.json().catch(() => null)
  const cantoStart = typeof body?.cantoStart === 'number' ? body.cantoStart : null
  const cantoEnd = typeof body?.cantoEnd === 'number' ? body.cantoEnd : null
  const englishStart = typeof body?.englishStart === 'number' ? body.englishStart : null
  const englishEnd = typeof body?.englishEnd === 'number' ? body.englishEnd : null
  const label = typeof body?.label === 'string' ? body.label : null

  if (cantoStart === null || cantoEnd === null || englishStart === null || englishEnd === null) {
    return NextResponse.json(
      { error: 'cantoStart, cantoEnd, englishStart, and englishEnd are required' },
      { status: 400 }
    )
  }

  const supabase = createSupabaseServerClient()
  const segment = await createSegment(supabase, episodeId, { label, cantoStart, cantoEnd, englishStart, englishEnd })
  return NextResponse.json({ segment }, { status: 201 })
}
