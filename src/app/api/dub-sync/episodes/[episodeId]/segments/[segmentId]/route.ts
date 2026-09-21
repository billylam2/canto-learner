import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { updateSegment, deleteSegment, type UpdateSegmentInput } from '@/lib/db/dub-sync'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string; segmentId: string }> }
): Promise<NextResponse> {
  const { segmentId } = await params
  const body = await request.json().catch(() => null)

  const patch: UpdateSegmentInput = {}
  if (typeof body?.label === 'string' || body?.label === null) patch.label = body.label
  if (typeof body?.cantoStart === 'number') patch.cantoStart = body.cantoStart
  if (typeof body?.cantoEnd === 'number') patch.cantoEnd = body.cantoEnd
  if (typeof body?.englishStart === 'number') patch.englishStart = body.englishStart
  if (typeof body?.englishEnd === 'number') patch.englishEnd = body.englishEnd

  const supabase = createSupabaseServerClient()
  const segment = await updateSegment(supabase, segmentId, patch)
  return NextResponse.json({ segment })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string; segmentId: string }> }
): Promise<NextResponse> {
  const { segmentId } = await params
  const supabase = createSupabaseServerClient()
  await deleteSegment(supabase, segmentId)
  return NextResponse.json({ ok: true })
}
