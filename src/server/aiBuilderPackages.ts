import Metronome from '@metronome/sdk';
import type { Packages } from '@metronome/sdk/resources/v1/packages';
import {
  AI_BUILDER_PACKAGE_NAMES,
  AI_BUILDER_QUICKSTART_TERMS,
} from '@/config/aiBuilderCatalog';
import { listPackages } from '@/utils/metronome';

type PackageRecord = Record<string, any>;

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
  const find = (name: string) =>
    packages.find(
      (pkg) =>
        String(pkg.name ?? '').trim().toLowerCase() === name.toLowerCase(),
    );

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
    pro: { id: pro.id, name: pro.name },
    quickstart: { id: quickstart.id, name: quickstart.name },
  };
}

