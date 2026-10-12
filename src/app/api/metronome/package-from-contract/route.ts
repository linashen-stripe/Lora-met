import { NextRequest, NextResponse } from 'next/server';
import { initializeMetronome } from '@/utils/metronome';
import { buildPackageCreateParamsFromV2Contract } from '@/utils/metronomeContractToPackageCreate';

/**
 * POST /api/metronome/package-from-contract
 *
 * Reads a v2 contract, maps it to `v1/packages/create`, and optionally creates a package.
 *
 * Body JSON:
 * - `customerId` (required): Metronome customer id
 * - `contractId` (required): v2 contract id
 * - `packageName` (required): name for the new package
 * - `contractName` (optional): default contract title when provisioning from the package
 * - `dryRun` (optional): if true, do not call create — return mapped body + warnings
 * - `uniquenessKey` (optional): passed through to package create (409 if reused)
 * - `defaultListPriceDiscountPercent` (optional): 0–100, applied to each `contract.discounts`
 *   product when synthesizing list-price `MULTIPLIER` overrides (`multiplier = 1 − pct/100`)
 * - `listPriceDiscountPercentByProductId` (optional): map of product UUID → 0–100 for per-product %-off
 *
 * Success (non–dry-run): `{ ok: true, packageId, newPackageId, warnings?, message? }`
 * (`packageId` and `newPackageId` are the same Metronome package UUID).
 */
function extractNewPackageId(created: unknown): string | null {
  const c = created as Record<string, unknown> | null;
  if (!c || typeof c !== 'object') return null;
  const data = c.data as Record<string, unknown> | string | undefined;
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    const id = data.id ?? data.package_id;
    if (typeof id === 'string') return id;
  }
  const top = c.id ?? c.package_id;
  if (typeof top === 'string') return top;
  return null;
}

export async function POST(request: NextRequest) {
  const metronome = initializeMetronome(request.headers);
  if (!metronome) {
    return NextResponse.json({ error: 'Metronome not configured' }, { status: 503 });
  }

  let body: {
    customerId?: string;
    contractId?: string;
    packageName?: string;
    contractName?: string;
    dryRun?: boolean;
    uniquenessKey?: string;
    defaultListPriceDiscountPercent?: number;
    listPriceDiscountPercentByProductId?: Record<string, number>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const customerId = body.customerId?.trim();
  const contractId = body.contractId?.trim();
  const packageName = body.packageName?.trim();
  if (!customerId || !contractId || !packageName) {
    return NextResponse.json(
      { error: 'customerId, contractId, and packageName are required' },
      { status: 400 },
    );
  }

  let retrieved: Awaited<ReturnType<typeof metronome.v2.contracts.retrieve>>;
  try {
    retrieved = await metronome.v2.contracts.retrieve({
      contract_id: contractId,
      customer_id: customerId,
      include_balance: true,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: 'Failed to retrieve contract', details: msg },
      { status: 502 },
    );
  }

  const contract = retrieved.data as any;
  if (!contract?.id) {
    return NextResponse.json({ error: 'Contract payload missing data' }, { status: 502 });
  }

  let mapped;
  try {
    mapped = buildPackageCreateParamsFromV2Contract(contract, {
      packageName,
      contractName: body.contractName?.trim(),
      defaultListPriceDiscountPercent:
        typeof body.defaultListPriceDiscountPercent === 'number'
          ? body.defaultListPriceDiscountPercent
          : undefined,
      listPriceDiscountPercentByProductId:
        body.listPriceDiscountPercentByProductId &&
        typeof body.listPriceDiscountPercentByProductId === 'object' &&
        !Array.isArray(body.listPriceDiscountPercentByProductId)
          ? body.listPriceDiscountPercentByProductId
          : undefined,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const createBody = {
    ...mapped.body,
    ...(body.uniquenessKey?.trim()
      ? { uniqueness_key: body.uniquenessKey.trim() }
      : {}),
  };

  if (body.dryRun) {
    return NextResponse.json({
      dryRun: true,
      warnings: mapped.warnings,
      packageCreateParams: createBody,
    });
  }

  try {
    const created = await metronome.v1.packages.create(createBody);
    const newPackageId = extractNewPackageId(created);
    if (!newPackageId) {
      console.error(
        '[package-from-contract] packages.create returned no id; body keys:',
        created && typeof created === 'object' ? Object.keys(created as object) : typeof created,
      );
      return NextResponse.json(
        {
          ok: false,
          error: 'Package create succeeded but response had no package id (check server logs).',
          warnings: mapped.warnings,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      packageId: newPackageId,
      newPackageId,
      warnings: mapped.warnings,
      message: `Created package ${newPackageId} from contract ${contractId}.`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: 'packages.create failed',
        details: msg,
        warnings: mapped.warnings,
        /** Last mapped body for debugging (Metronome may echo validation errors). */
        packageCreateParams: createBody,
      },
      { status: 502 },
    );
  }
}
