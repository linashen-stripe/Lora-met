import { NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import { deriveCustomerNameFromEmail } from '@/utils/helpers';
import {
  initializeMetronome,
  createMetronomeCustomer,
  createContract,
  assignContractSeats,
  listPackages,
  resolveMetronomeDeliveryMethodIdAsync,
} from '@/utils/metronome';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';
import {
  DEMO_MODES,
  normalizeDemoMode,
  type DemoMode,
} from '@/config/demoModes';

interface RequestBody {
  email: string;
  name?: string;
  companyName?: string;
  message?: string;
  packageId?: string;
  planType?: string;
  demoMode?: DemoMode;
}

export async function POST(request: NextRequest) {
  try {
    const metronome = initializeMetronome(request.headers);
    if (!metronome) {
      return NextResponse.json(
        {
          message:
            'Metronome API key is not set. Add METRONOME_API_KEY to .env or enter it in the Tools panel.',
        },
        { status: 503 },
      );
    }

    const body: RequestBody = await request.json();
    const { email, name, companyName, planType } = body;
    const demoMode = normalizeDemoMode(body.demoMode);
    const modeDefinition = DEMO_MODES[demoMode];
    let { packageId } = body;

    // For free plan sign-ups without an explicit packageId, find the free trial package dynamically
    if (!packageId && planType === 'free') {
      const packages = await listPackages(metronome);
      const modeNames = new Set(
        modeDefinition.packageNames.free.map((packageName) =>
          packageName.toLowerCase(),
        ),
      );
      const trialPackage =
        packages.find((pkg: any) =>
          modeNames.has(String(pkg.name ?? '').trim().toLowerCase()),
        ) ??
        packages.find((pkg: any) => /free|trial/i.test(pkg.name ?? ''));
      if (trialPackage) {
        packageId = trialPackage.id;
        console.log(
          `✅ Resolved free trial package: ${trialPackage.name} (${packageId})`,
        );
      }
    }

    if (!email) {
      return NextResponse.json({ message: 'Missing email' }, { status: 400 });
    }

    const baseCustomerName =
      companyName || name || deriveCustomerNameFromEmail(email);
    const customerName = `[${modeDefinition.label}] ${baseCustomerName}`;
    const ingestAlias = `${modeDefinition.customerPrefix}:${email}`;

    // Resolve rate card currency from the package so the Stripe customer is created
    // in the correct currency (e.g. GBP for UK-market accounts).
    // Create Stripe customer first so Metronome can use it for invoicing
    let stripeCustomerId: string | undefined;
    let stripe: ReturnType<typeof initializeStripe> | null = null;
    try {
      stripe = initializeStripe(request.headers);
    } catch (stripeConfigError) {
      console.warn(
        '⚠️ Stripe is not configured; creating a Metronome-only customer:',
        stripeConfigError,
      );
    }
    if (stripe) {
      try {
        const stripeCustomer = await stripe.customers.create({
          email,
          name: customerName,
        });
        stripeCustomerId = stripeCustomer.id;
        console.log(`✅ Created Stripe customer: ${stripeCustomerId}`);
      } catch (stripeError) {
        console.warn(
          '⚠️ Could not create Stripe customer, continuing without:',
          stripeError,
        );
      }
    }

    let metronomeCustomerId: string;
    let metronomeContractId: string | undefined;

    const { metronomeDeliveryMethodId } = withFallbackHeaders(request.headers);
    const deliveryMethodId = await resolveMetronomeDeliveryMethodIdAsync(metronome, metronomeDeliveryMethodId);

    try {
      metronomeCustomerId = await createMetronomeCustomer(metronome, {
        name: customerName,
        ingestAliases: [ingestAlias],
        stripeCustomerId,
        deliveryMethodId,
      });
      console.log(`✅ Created Metronome customer: ${metronomeCustomerId}`);
    } catch (metronomeError: any) {
      if (metronomeError?.status === 409) {
        return NextResponse.json(
          { message: 'This email is already in use.' },
          { status: 409 },
        );
      }
      throw metronomeError;
    }

    // Create a contract if a packageId was provided (free trial or paid package)
    if (packageId) {
      try {
        const startingAt = new Date();
        startingAt.setMinutes(0, 0, 0);
        metronomeContractId = await createContract(metronome, {
          metronomeCustomerId,
          packageId: packageId,
          startingAt: startingAt.toISOString(),
          preferredDeliveryMethodId: deliveryMethodId,
        });
        console.log(`✅ Created Metronome contract: ${metronomeContractId}`);

        try {
          await assignContractSeats(
            metronome,
            metronomeCustomerId,
            metronomeContractId,
            email,
          );
          console.log(`✅ Assigned seats for contract: ${metronomeContractId}`);
        } catch (seatError) {
          console.warn('⚠️ Could not assign contract seats:', seatError);
        }
      } catch (contractError) {
        console.error('⚠️ Failed to create Metronome contract:', contractError);
      }
    }

    return NextResponse.json({
      message: 'Customer created successfully.',
      customerId: metronomeCustomerId,
      metronomeCustomerId,
      name: customerName,
      demoMode,
      ...(stripeCustomerId ? { stripeCustomerId } : {}),
      ...(metronomeContractId ? { metronomeContractId } : {}),
    });
  } catch (error) {
    console.error('Error in sign-up process: ', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { message: 'Error creating customer', error: errorMessage },
      { status: 500 },
    );
  }
}
