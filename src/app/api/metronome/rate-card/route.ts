import { NextRequest, NextResponse } from 'next/server';
import { initializeMetronome, listPackages } from '@/utils/metronome';

export interface ModelRate {
  name: string;
  input: number | null;
  output: number | null;
}

export interface ServiceRate {
  name: string;
  price: number;
}

export interface RateCardData {
  modelRates: ModelRate[];
  serviceRates: ServiceRate[];
}

export async function GET(request: NextRequest) {
  try {
    const metronome = initializeMetronome(request.headers);
    if (!metronome) {
      return NextResponse.json({ modelRates: [], serviceRates: [] });
    }

    // Find the rate_card_id from the first non-free package
    const packages = await listPackages(metronome);
    const rateCardPackage = packages.find(
      (p: any) => p.rate_card_id && !/free|trial/i.test(p.name ?? ''),
    );

    if (!rateCardPackage?.rate_card_id) {
      return NextResponse.json({ modelRates: [], serviceRates: [] });
    }

    // Fetch all rates from the rate card
    const rates: any[] = [];
    for await (const r of metronome.v1.contracts.rateCards.rates.list({
      rate_card_id: rateCardPackage.rate_card_id,
      at: new Date().toISOString(),
    })) {
      rates.push(r);
    }

    console.log('[rate-card] raw rates:', JSON.stringify(rates, null, 2));

    return NextResponse.json({ raw: rates, modelRates: [], serviceRates: [] });
  } catch (error) {
    console.error('Error fetching rate card:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rate card' },
      { status: 500 },
    );
  }
}
