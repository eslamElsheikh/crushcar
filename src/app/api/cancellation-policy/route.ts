import { NextResponse } from 'next/server'
import { cancellationPolicy } from '@/lib/cancellation-policy'

export async function GET() {
  return NextResponse.json(cancellationPolicy)
}
