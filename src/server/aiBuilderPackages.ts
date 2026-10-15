import Metronome from '@metronome/sdk';
import type { Packages } from '@metronome/sdk/resources/v1/packages';
import {
  AI_BUILDER_PACKAGE_NAMES,
  AI_BUILDER_QUICKSTART_TERMS,
} from '@/config/aiBuilderCatalog';
import { listPackages } from '@/utils/metronome';

type PackageRecord = Record<string, any>;

const AI_BUILDER_USAGE_TAG = 'usage';

function priorMonthStart(): string {
  // Seeded B2B contracts and events begin in the prior month. Backdate the
  // metadata-only tag version to the same boundary so tag-scoped commits,
  // recurring seat credits, and discounts all cover that historical usage.
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  ).toISOString();
}

export async function ensureAiBuilderUsageProductTags(
  metronome: Metronome,
  packages?: PackageRecord[],
): Promise<number> {
  // Legacy AI Builder products predate the canonical `usage` tag. Keep this
  // repair idempotent and preserve every existing tag; B2B contract terms rely
  // on this tag rather than hard-coded product ids.
  const packageRecords =
    packages ?? ((await listPackages(metronome)) as PackageRecord[]);
  const aiPackageNames = new Set(
    Object.values(AI_BUILDER_PACKAGE_NAMES).map((name) => name.toLowerCase()),
  );
  const rateCardIds = new Set(
    packageRecords
      .filter((pkg) =>
        aiPackageNames.has(String(pkg.name ?? '').trim().toLowerCase()),
      )
      .map((pkg) => pkg.rate_card_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );

  const rateProductIds = new Set<string>();
  for (const rateCardId of rateCardIds) {
    for await (const rate of metronome.v1.contracts.rateCards.rates.list({
      rate_card_id: rateCardId,
      at: new Date().toISOString(),
    })) {
      const productId = (rate as any).product_id;
      if (typeof productId === 'string') rateProductIds.add(productId);
    }
  }

  let updated = 0;
  for await (const product of metronome.v1.contracts.products.list({
    archive_filter: 'NOT_ARCHIVED',
  })) {
    if (product.type !== 'USAGE' || !rateProductIds.has(product.id)) continue;
    const tags = product.current?.tags ?? [];
    if (tags.includes(AI_BUILDER_USAGE_TAG)) continue;
    await metronome.v1.contracts.products.update({
      product_id: product.id,
      starting_at: priorMonthStart(),
      tags: [...tags, AI_BUILDER_USAGE_TAG],
    });
    updated += 1;
  }
  return updated;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a numeric Metronome package value, received ${value}`);
  }
  return parsed;
}

function offset(value: any) {
  return {
    value: numberValue(value?.value ?? 0),
    unit: value?.unit ?? 'DAYS',
  };
}

function duration(value: any, fallbackMonths?: number) {
  if (fallbackMonths != null) {
    return { value: fallbackMonths, unit: 'MONTHS' as const };
  }
  return {
    value: numberValue(value?.value),
    unit: value?.unit,
  };
}

function packageId(response: unknown): string {
  const record = response as any;
  const id =
    record?.data?.id ??
    record?.data?.package_id ??
    record?.id ??
    record?.package_id;
  if (typeof id !== 'string') {
    throw new Error('Metronome package creation returned no package ID.');
  }
  return id;
}

function commonPackageFields(source: PackageRecord) {
  return {
    rate_card_id: source.rate_card_id,
    ...(source.billing_provider
      ? { billing_provider: source.billing_provider }
      : {}),
    ...(source.delivery_method
      ? { delivery_method: source.delivery_method }
      : {}),
    billing_anchor_date: 'contract_start_date' as const,
    multiplier_override_prioritization:
      source.multiplier_override_prioritization ?? 'LOWEST_MULTIPLIER',
    usage_statement_schedule: {
      frequency: source.usage_statement_schedule?.frequency ?? 'MONTHLY',
      day: 'CONTRACT_START' as const,
    },
  };
}

function freePackageBody(source: PackageRecord): Packages.PackageCreateParams {
  const credit = source.credits?.[0];
  if (!credit) {
    throw new Error(
      `Legacy ${AI_BUILDER_PACKAGE_NAMES.legacyFree} package is missing its trial credit.`,
    );
  }
  return {
    name: AI_BUILDER_PACKAGE_NAMES.free,
    contract_name: 'AI Builder Free',
    aliases: [{ name: 'ai-builder-free' }],
    uniqueness_key: 'lora-ai-builder-free-v1',
    ...commonPackageFields(source),
    credits: [
      {
        product_id: credit.product?.id ?? credit.product_id,
        rate_type: credit.rate_type ?? 'LIST_RATE',
        priority: credit.priority,
        applicable_product_ids: credit.applicable_product_ids,
        applicable_product_tags: credit.applicable_product_tags,
        access_schedule: {
          credit_type_id:
            credit.access_schedule?.credit_type?.id ??
            credit.access_schedule?.credit_type_id,
          schedule_items: credit.access_schedule.schedule_items.map(
            (item: any) => ({
              amount: numberValue(item.amount),
              starting_at_offset: offset(item.starting_at_offset),
              duration: duration(item.duration),
            }),
          ),
        },
      },
    ],
  } as Packages.PackageCreateParams;
}

function proPackageBody(source: PackageRecord): Packages.PackageCreateParams {
  const credit = source.credits?.[0];
  const subscription = source.subscriptions?.[0];
  if (!credit || !subscription) {
    throw new Error(
      `Legacy ${AI_BUILDER_PACKAGE_NAMES.legacyPro} package is missing its credit or subscription.`,
    );
  }
  return {
    name: AI_BUILDER_PACKAGE_NAMES.pro,
    contract_name: 'AI Builder Pro',
    aliases: [{ name: 'ai-builder-pro' }],
    uniqueness_key: 'lora-ai-builder-pro-v1',
    ...commonPackageFields(source),
    credits: [
      {
        product_id: credit.product?.id ?? credit.product_id,
        rate_type: credit.rate_type ?? 'LIST_RATE',
        priority: credit.priority,
        applicable_product_ids: credit.applicable_product_ids,
        applicable_product_tags: credit.applicable_product_tags,
        access_schedule: {
          credit_type_id:
            credit.access_schedule?.credit_type?.id ??
            credit.access_schedule?.credit_type_id,
          schedule_items: credit.access_schedule.schedule_items.map(
            (item: any) => ({
              amount: numberValue(item.amount),
              starting_at_offset: offset(item.starting_at_offset),
              duration: duration(item.duration),
            }),
          ),
        },
      },
    ],
    subscriptions: [
      {
        collection_schedule: subscription.collection_schedule,
        subscription_rate: {
          product_id:
            subscription.subscription_rate?.product?.id ??
            subscription.subscription_rate?.product_id,
          billing_frequency:
            subscription.subscription_rate?.billing_frequency ?? 'MONTHLY',
        },
        proration: {
          is_prorated: subscription.proration?.is_prorated ?? false,
          invoice_behavior:
            subscription.proration?.invoice_behavior ?? 'BILL_IMMEDIATELY',
        },
        initial_quantity: subscription.initial_quantity ?? 1,
        quantity_management_mode:
          subscription.quantity_management_mode ?? 'QUANTITY_ONLY',
        starting_at_offset: offset(subscription.starting_at_offset),
      },
    ],
  } as Packages.PackageCreateParams;
}

function quickstartPackageBody(
  source: PackageRecord,
): Packages.PackageCreateParams {
  const commit = source.commits?.[0];
  if (!commit) {
    throw new Error(
      `Legacy ${AI_BUILDER_PACKAGE_NAMES.legacyQuickstart} package is missing its prepaid commit.`,
    );
  }
  const months = AI_BUILDER_QUICKSTART_TERMS.durationMonths;
  const invoiceSchedule = commit.invoice_schedule;
  return {
    name: AI_BUILDER_PACKAGE_NAMES.quickstart,
    contract_name: 'AI Builder Enterprise Quickstart',
    aliases: [{ name: 'ai-builder-enterprise-quickstart' }],
    uniqueness_key: 'lora-ai-builder-enterprise-quickstart-v1',
    duration: { value: months, unit: 'MONTHS' },
    ...commonPackageFields(source),
    commits: [
      {
        product_id: commit.product?.id ?? commit.product_id,
        type: commit.type ?? 'PREPAID',
        rate_type: commit.rate_type ?? 'LIST_RATE',
        priority: commit.priority,
        applicable_product_ids: commit.applicable_product_ids,
        applicable_product_tags: commit.applicable_product_tags,
        access_schedule: {
          credit_type_id:
            commit.access_schedule?.credit_type?.id ??
            commit.access_schedule?.credit_type_id,
          schedule_items: commit.access_schedule.schedule_items.map(
            (item: any) => ({
              amount: numberValue(item.amount),
              starting_at_offset: offset(item.starting_at_offset),
              duration: duration(item.duration, months),
            }),
          ),
        },
        invoice_schedule: {
          credit_type_id:
            invoiceSchedule?.credit_type?.id ??
            invoiceSchedule?.credit_type_id,
          do_not_invoice: invoiceSchedule?.do_not_invoice ?? false,
          schedule_items: (invoiceSchedule?.schedule_items ?? []).map(
            (item: any) => ({
              unit_price: numberValue(item.unit_price),
              quantity: numberValue(item.quantity),
              date_offset: offset(item.date_offset),
            }),
          ),
        },
      },
    ],
  } as Packages.PackageCreateParams;
}

export async function ensureAiBuilderPackages(metronome: Metronome) {
  const packages = (await listPackages(metronome)) as PackageRecord[];
  const usageProductsTagged = await ensureAiBuilderUsageProductTags(
    metronome,
    packages,
  );
  const find = (name: string) =>
    packages.find(
      (pkg) =>
        String(pkg.name ?? '').trim().toLowerCase() === name.toLowerCase(),
    );

  let free = find(AI_BUILDER_PACKAGE_NAMES.free);
  if (!free) {
    const legacyFree = find(AI_BUILDER_PACKAGE_NAMES.legacyFree);
    if (!legacyFree) {
      throw new Error(
        `Could not find ${AI_BUILDER_PACKAGE_NAMES.legacyFree} to create ${AI_BUILDER_PACKAGE_NAMES.free}.`,
      );
    }
    const created = await metronome.v1.packages.create(
      freePackageBody(legacyFree),
    );
    free = { id: packageId(created), name: AI_BUILDER_PACKAGE_NAMES.free };
  }

  let pro = find(AI_BUILDER_PACKAGE_NAMES.pro);
  if (!pro) {
    const legacyPro = find(AI_BUILDER_PACKAGE_NAMES.legacyPro);
    if (!legacyPro) {
      throw new Error(
        `Could not find ${AI_BUILDER_PACKAGE_NAMES.legacyPro} to create ${AI_BUILDER_PACKAGE_NAMES.pro}.`,
      );
    }
    const created = await metronome.v1.packages.create(
      proPackageBody(legacyPro),
    );
    pro = { id: packageId(created), name: AI_BUILDER_PACKAGE_NAMES.pro };
  }

  let quickstart = find(AI_BUILDER_PACKAGE_NAMES.quickstart);
  if (!quickstart) {
    const legacyQuickstart = find(
      AI_BUILDER_PACKAGE_NAMES.legacyQuickstart,
    );
    if (!legacyQuickstart) {
      throw new Error(
        `Could not find ${AI_BUILDER_PACKAGE_NAMES.legacyQuickstart} to create ${AI_BUILDER_PACKAGE_NAMES.quickstart}.`,
      );
    }
    const created = await metronome.v1.packages.create(
      quickstartPackageBody(legacyQuickstart),
    );
    quickstart = {
      id: packageId(created),
      name: AI_BUILDER_PACKAGE_NAMES.quickstart,
    };
  }

  return {
    usageProductsTagged,
    free: { id: free.id, name: free.name },
    pro: { id: pro.id, name: pro.name },
    quickstart: { id: quickstart.id, name: quickstart.name },
  };
}

