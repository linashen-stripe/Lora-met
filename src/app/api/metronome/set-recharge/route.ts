import { NextRequest, NextResponse } from 'next/server';
import { setRechargeAmount, getRechargeAmount } from '@/utils/metronomeTopUpStore';

export async function POST(request: NextRequest) {
  const { metronomeCustomerId, amountDollars } = await request.json();
  if (!metronomeCustomerId || typeof amountDollars !== 'number') {
    return NextResponse.json({ error: 'metronomeCustomerId and amountDollars required' }, { status: 400 });
  }
  setRechargeAmount(metronomeCustomerId, amountDollars);
  return NextResponse.json({ metronomeCustomerId, amountDollars: getRechargeAmount(metronomeCustomerId) });
}
