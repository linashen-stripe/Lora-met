import { NextRequest, NextResponse } from 'next/server';
import { getDemoUsageSeedStatus } from '@/server/demoUsageSeedStatus';

export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get('customerId');
  if (!customerId) {
    return NextResponse.json(
      { error: 'customerId is required' },
      { status: 400 },
    );
  }

  return NextResponse.json({
    status: getDemoUsageSeedStatus(customerId),
  });
}
