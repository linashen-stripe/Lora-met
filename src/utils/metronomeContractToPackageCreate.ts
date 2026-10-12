/**
 * Build `v1/packages/create` payload from a `v2/contracts/get` contract (scratch or
 * package-provisioned). Metronome has no "clone contract to package" RPC — this maps
 * absolute contract dates to package-relative offsets.
 *
 * Contract `discounts[]` is not a package field; list-price %-off is synthesized as
 * `MULTIPLIER` overrides (`multiplier = 1 - percent/100`) when a percent is known from
 * options or discount `custom_fields` / loose API fields.
 */
import { differenceInCalendarMonths } from 'date-fns';
import type { PackageCreateParams } from '@metronome/sdk/resources/v1/packages';

export interface BuildPackageFromContractOptions {
  /** New package display name */
  packageName: string;
  /** Optional default contract title when provisioning from this package */
  contractName?: string;
  /**
   * Applied to each `contract.discounts[]` product when no per-product or inferred percent exists.
   * Percent is 0–100 (e.g. 15 for 15% off list → multiplier 0.85).
   */
  defaultListPriceDiscountPercent?: number;
  /**
   * Per `discount.product.id`, list-price discount percent (0–100) for synthesized MULTIPLIER overrides.
   */
  listPriceDiscountPercentByProductId?: Record<string, number>;
}

export interface BuildPackageFromContractResult {
  body: PackageCreateParams;
  warnings: string[];
}

function parseIso(s: string | undefined | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole months between `from` (inclusive) and `to` (exclusive month boundary), at least 1. */
function monthsSpan(from: Date, to: Date): number {
  return Math.max(1, differenceInCalendarMonths(to, from));
}

/** Calendar months from contract start to `d` (for offsets). */
function monthsFromAnchor(anchor: Date, d: Date): number {
  return Math.max(0, differenceInCalendarMonths(d, anchor));
}

/**
 * Pick `quantity_schedule[].quantity` for the segment covering `anchor` (inclusive start,
 * exclusive `ending_before`). Falls back to the latest segment that already started, then
 * the first list item — `quantity_schedule[0]` is not always the row active at contract start.
 */
function resolveQuantityScheduleAtAnchor(sub: any, anchor: Date): number | undefined {
  const items = sub?.quantity_schedule as
    | Array<{ quantity?: number; starting_at?: string; ending_before?: string }>
    | undefined;
  if (!items?.length) return undefined;

  const segments = items.map((seg) => ({
    quantity: seg.quantity,
    start: parseIso(seg.starting_at),
    end: parseIso(seg.ending_before),
  }));

  for (const seg of segments) {
    const start = seg.start;
    if (!start) continue;
    const end = seg.end;
    if (anchor.getTime() >= start.getTime() && (!end || anchor.getTime() < end.getTime())) {
      return typeof seg.quantity === 'number' ? seg.quantity : undefined;
    }
  }

  let bestStart: Date | null = null;
  let bestQty: number | undefined;
  for (const seg of segments) {
    const start = seg.start;
    if (!start || anchor.getTime() < start.getTime()) continue;
    if (!bestStart || start.getTime() > bestStart.getTime()) {
      bestStart = start;
      bestQty = typeof seg.quantity === 'number' ? seg.quantity : undefined;
    }
  }
  if (bestStart && typeof bestQty === 'number') return bestQty;

  const q0 = items[0]?.quantity;
  return typeof q0 === 'number' ? q0 : undefined;
}

/** Recurring credits linked to this subscription often carry the seat count in `access_amount.quantity`. */
function inferSeatQuantityFromLinkedRecurringCredits(contract: any, subId: string): number | undefined {
  let maxQ: number | undefined;
  for (const rc of contract?.recurring_credits ?? []) {
    if (rc?.subscription_config?.subscription_id !== subId) continue;
    const q = rc?.access_amount?.quantity;
    if (typeof q === 'number' && q > 0) {
      maxQ = maxQ === undefined ? q : Math.max(maxQ, q);
    }
  }
  return maxQ;
}

function mapBillingFromContract(c: any): Pick<
  PackageCreateParams,
  'billing_provider' | 'delivery_method'
> {
  const cfg = c?.customer_billing_provider_configuration?.configuration;
  const bp = c?.customer_billing_provider_configuration?.billing_provider as
    | PackageCreateParams['billing_provider']
    | undefined;
  const dm = c?.customer_billing_provider_configuration?.delivery_method as
    | PackageCreateParams['delivery_method']
    | undefined;
  if (bp && dm) return { billing_provider: bp, delivery_method: dm };
  if (cfg?.stripe_customer_id && bp === 'stripe') {
    return { billing_provider: 'stripe', delivery_method: dm ?? 'direct_to_billing_provider' };
  }
  return { billing_provider: 'stripe', delivery_method: 'direct_to_billing_provider' };
}

function mapCommitAccessItems(
  anchor: Date,
  items: any[],
): PackageCreateParams.Commit.AccessSchedule['schedule_items'] {
  return items.map((si) => {
    const start = parseIso(si.starting_at) ?? anchor;
    const end = parseIso(si.ending_before) ?? anchor;
    const startOff = monthsFromAnchor(anchor, start);
    const dur = monthsSpan(start, end);
    return {
      amount: Number(si.amount ?? 0),
      starting_at_offset: { unit: 'MONTHS' as const, value: startOff },
      duration: { unit: 'MONTHS' as const, value: dur },
    };
  });
}

function mapCommitInvoiceItems(
  anchor: Date,
  items: any[],
): PackageCreateParams.Commit.InvoiceSchedule['schedule_items'] {
  return items.map((si) => {
    const ts = parseIso(si.timestamp) ?? anchor;
    const off = monthsFromAnchor(anchor, ts);
    return {
      date_offset: { unit: 'MONTHS' as const, value: off },
      quantity: Number(si.quantity ?? 1),
      unit_price: Number(si.unit_price ?? si.amount ?? 0),
    };
  });
}

/** Contract v2 access/invoice schedules may use `credit_type.id` or `credit_type_id`. */
function resolveScheduleCreditTypeId(schedule: any): string | undefined {
  return schedule?.credit_type_id ?? schedule?.credit_type?.id;
}

/** Contract v2 uses nested `credit_type`; package create expects `credit_type_id`. */
function normalizeOverwriteRate(
  ow: any,
): PackageCreateParams.Override.OverwriteRate | undefined {
  if (!ow) return undefined;
  const creditTypeId = ow.credit_type_id ?? ow.credit_type?.id;
  const out: PackageCreateParams.Override.OverwriteRate = {
    rate_type: ow.rate_type,
    price: ow.price,
    quantity: ow.quantity,
    is_prorated: ow.is_prorated,
    tiers: ow.tiers,
    custom_rate: ow.custom_rate,
  };
  if (creditTypeId) out.credit_type_id = creditTypeId;
  return out;
}

/**
 * `v2/contracts` often scopes overrides with top-level `product` or
 * `applicable_product_tags` while `override_specifiers` is empty. `v1/packages/create`
 * requires non-empty `override_specifiers`, so we derive them when missing.
 */
function buildOverrideSpecifiersFromContract(
  o: any,
): PackageCreateParams.Override.OverrideSpecifier[] {
  const fromApi = o.override_specifiers as PackageCreateParams.Override.OverrideSpecifier[] | undefined;
  if (fromApi?.length) {
    return fromApi.map((s) => ({ ...s }));
  }
  if (o.product?.id) {
    return [{ product_id: o.product.id as string }];
  }
  if (Array.isArray(o.applicable_product_tags) && o.applicable_product_tags.length) {
    return [{ product_tags: [...o.applicable_product_tags] }];
  }
  return [];
}

function mapOverrides(
  anchor: Date,
  ending: Date,
  overrides: any[] | undefined,
  warnings: string[],
): PackageCreateParams.Override[] {
  if (!overrides?.length) return [];
  const termMonths = monthsSpan(anchor, ending);
  return overrides.flatMap((o: any) => {
    const specs = buildOverrideSpecifiersFromContract(o);
    if (!specs.length) {
      warnings.push(
        `Contract override (id=${o.id ?? 'n/a'}) has no override_specifiers, product, or applicable_product_tags — skipping (cannot build package override).`,
      );
      return [];
    }
    const start = parseIso(o.starting_at) ?? anchor;
    const end = parseIso(o.ending_before) ?? ending;
    const startOff = monthsFromAnchor(anchor, start);
    const dur = Math.max(1, monthsSpan(start, end));
    const tierSource = o.tiers ?? o.override_tiers;
    const base: PackageCreateParams.Override = {
      override_specifiers: specs,
      starting_at_offset: { unit: 'MONTHS', value: startOff },
      duration: { unit: 'MONTHS', value: Math.min(dur, termMonths) },
      type: o.type,
      entitled: o.entitled,
      is_commit_specific: o.is_commit_specific,
      priority: o.priority,
      multiplier: o.multiplier,
      overwrite_rate: normalizeOverwriteRate(o.overwrite_rate),
    };
    if (tierSource?.length) {
      base.tiers = tierSource;
    }
    // Package API: `target` is only valid when the override is commit-specific.
    if (o.is_commit_specific && o.target) {
      base.target = o.target;
    }
    return [base];
  });
}

/** Metronome contract `discounts[]` may expose %-off outside the typed SDK shape. */
function inferListPriceDiscountPercentFromDiscount(d: any): number | null {
  const candidates = [
    d?.list_price_discount_percent,
    d?.discount_percent,
    d?.percent_off,
    d?.custom_fields?.list_price_discount_percent,
    d?.custom_fields?.discount_percent,
    d?.custom_fields?.percent_off,
  ];
  for (const raw of candidates) {
    if (raw === undefined || raw === null || raw === '') continue;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) continue;
    return Math.max(0, Math.min(100, n));
  }
  return null;
}

/** List-price discount: customer pays `(1 - pct/100)` × list (e.g. 15% off → multiplier 0.85). */
function synthesizedListPriceMultiplierOverride(
  productId: string,
  discountPercent: number,
  anchor: Date,
  ending: Date,
  priority: number,
): PackageCreateParams.Override {
  const pct = Math.max(0, Math.min(100, discountPercent));
  const multiplier = 1 - pct / 100;
  const termMonths = monthsSpan(anchor, ending);
  return {
    override_specifiers: [{ product_id: productId }],
    starting_at_offset: { unit: 'MONTHS', value: 0 },
    duration: { unit: 'MONTHS', value: termMonths },
    type: 'MULTIPLIER',
    multiplier,
    priority,
  };
}

function mapDiscountsToListPriceMultiplierOverrides(
  contract: any,
  anchor: Date,
  ending: Date,
  options: BuildPackageFromContractOptions,
  warnings: string[],
): PackageCreateParams.Override[] {
  const discounts = contract?.discounts as any[] | undefined;
  if (!discounts?.length) return [];

  const byProduct = options.listPriceDiscountPercentByProductId;
  const defaultPct = options.defaultListPriceDiscountPercent;

  const out: PackageCreateParams.Override[] = [];
  let idx = 0;

  for (const d of discounts) {
    const pid = d?.product?.id as string | undefined;
    if (!pid) {
      warnings.push(
        'discount entry missing product.id — skipping synthesized list-price MULTIPLIER override',
      );
      continue;
    }
    const fromMap = byProduct?.[pid];
    const pct =
      (typeof fromMap === 'number' && Number.isFinite(fromMap) ? fromMap : undefined) ??
      inferListPriceDiscountPercentFromDiscount(d) ??
      (typeof defaultPct === 'number' && Number.isFinite(defaultPct) ? defaultPct : undefined);

    if (pct == null) {
      warnings.push(
        `discount for product ${pid}: no list-price discount percent (pass defaultListPriceDiscountPercent or listPriceDiscountPercentByProductId, or set custom_fields.list_price_discount_percent on the discount) — skipping`,
      );
      continue;
    }

    out.push(synthesizedListPriceMultiplierOverride(pid, pct, anchor, ending, 1000 + idx));
    idx += 1;
  }

  if (out.length) {
    warnings.push(
      `Synthesized ${out.length} list-price MULTIPLIER override(s) from contract.discounts (multiplier = 1 − percent/100).`,
    );
  } else if (discounts.length) {
    warnings.push(
      'Contract has discounts[] but no list-price MULTIPLIER overrides were synthesized — set defaultListPriceDiscountPercent, listPriceDiscountPercentByProductId, or custom_fields.list_price_discount_percent on each discount.',
    );
  }

  return out;
}

function mapUsageStatementSchedule(c: any): PackageCreateParams['usage_statement_schedule'] {
  const u = c?.usage_statement_schedule;
  if (!u?.frequency) return { frequency: 'MONTHLY', day: 'CONTRACT_START' };
  const anchor = parseIso(c?.starting_at);
  const billAnchor = parseIso(u.billing_anchor_date);
  const day =
    anchor && billAnchor && billAnchor.getTime() === anchor.getTime()
      ? ('CONTRACT_START' as const)
      : ('FIRST_OF_MONTH' as const);
  return { frequency: u.frequency, day };
}

/**
 * @param contract — `response.data` from `v2.contracts.retrieve`
 */
export function buildPackageCreateParamsFromV2Contract(
  contract: any,
  options: BuildPackageFromContractOptions,
): BuildPackageFromContractResult {
  const warnings: string[] = [];
  const anchor = parseIso(contract?.starting_at);
  const ending = parseIso(contract?.ending_before);
  if (!anchor || !ending) {
    throw new Error('Contract must include starting_at and ending_before');
  }

  const rateCardId = contract.rate_card_id as string | undefined;
  if (!rateCardId) {
    throw new Error('Contract must include rate_card_id (or use a package-backed contract)');
  }

  const termMonths = monthsSpan(anchor, ending);
  const duration: PackageCreateParams.Duration = { unit: 'MONTHS', value: termMonths };

  const subscriptionIdToTemp = new Map<string, string>();
  (contract.subscriptions ?? []).forEach((sub: any, i: number) => {
    if (sub?.id) subscriptionIdToTemp.set(sub.id, `pkg-sub-${i}`);
  });

  const commits: NonNullable<PackageCreateParams['commits']> = (contract.commits ?? []).map((cm: any) => {
    const accessItems = cm?.access_schedule?.schedule_items ?? [];
    const invItems = cm?.invoice_schedule?.schedule_items ?? [];
    const out: PackageCreateParams.Commit = {
      product_id: cm.product?.id ?? cm.product_id,
      type: cm.type,
      rate_type: cm.rate_type ?? 'LIST_RATE',
      priority: cm.priority,
      name: cm.name,
      description: cm.description,
      applicable_product_ids: cm.applicable_product_ids,
      applicable_product_tags: cm.applicable_product_tags,
      access_schedule: {
        credit_type_id: resolveScheduleCreditTypeId(cm?.access_schedule),
        schedule_items: mapCommitAccessItems(anchor, accessItems),
      },
    };
    if (invItems.length) {
      out.invoice_schedule = {
        credit_type_id: resolveScheduleCreditTypeId(cm?.invoice_schedule),
        do_not_invoice: cm?.invoice_schedule?.do_not_invoice,
        schedule_items: mapCommitInvoiceItems(anchor, invItems),
      };
    }
    return out;
  });

  const credits: NonNullable<PackageCreateParams['credits']> = (contract.credits ?? []).map(
    (cr: any) => {
      const accessItems = cr?.access_schedule?.schedule_items ?? [];
      return {
        product_id: cr.product?.id ?? cr.product_id,
        access_schedule: {
          credit_type_id:
            resolveScheduleCreditTypeId(cr?.access_schedule) ?? cr?.credit_type?.id,
          schedule_items: mapCommitAccessItems(anchor, accessItems),
        },
        applicable_product_ids: cr.applicable_product_ids,
        applicable_product_tags: cr.applicable_product_tags,
        name: cr.name,
        description: cr.description,
        priority: cr.priority,
        rate_type: cr.rate_type ?? 'LIST_RATE',
        custom_fields: cr.custom_fields,
        specifiers: cr.specifiers,
      } satisfies PackageCreateParams.Credit;
    },
  );

  const subscriptions: NonNullable<PackageCreateParams['subscriptions']> = (
    contract.subscriptions ?? []
  ).map(
    (sub: any) => {
      const tempId = subscriptionIdToTemp.get(sub.id)!;
      const scheduleQty = resolveQuantityScheduleAtAnchor(sub, anchor);
      const fromRc = inferSeatQuantityFromLinkedRecurringCredits(contract, sub.id);
      const qty =
        typeof scheduleQty === 'number' && scheduleQty > 0
          ? scheduleQty
          : typeof fromRc === 'number' && fromRc > 0
            ? fromRc
            : typeof scheduleQty === 'number'
              ? scheduleQty
              : fromRc;
      if (typeof fromRc === 'number' && fromRc > 0 && !(typeof scheduleQty === 'number' && scheduleQty > 0)) {
        warnings.push(
          `subscription ${sub.id}: quantity_schedule had no positive quantity at contract start; used ${fromRc} from linked recurring_credits[].access_amount.quantity for package seat/quantity.`,
        );
      }
      const seatKey = sub.seat_config?.seat_group_key;
      const mode =
        sub.quantity_management_mode === 'SEAT_BASED' ? ('SEAT_BASED' as const) : ('QUANTITY_ONLY' as const);
      const row: PackageCreateParams.Subscription = {
        temporary_id: tempId,
        collection_schedule: sub.collection_schedule,
        proration: {
          is_prorated: sub.proration?.is_prorated ?? false,
          invoice_behavior: sub.proration?.invoice_behavior,
        },
        subscription_rate: {
          billing_frequency: sub.subscription_rate?.billing_frequency,
          product_id: sub.subscription_rate?.product?.id ?? sub.subscription_rate?.product_id,
        },
        quantity_management_mode: mode,
        name: sub.name,
        custom_fields: sub.custom_fields,
      };
      if (mode === 'SEAT_BASED' && seatKey) {
        row.seat_config = {
          seat_group_key: seatKey,
          initial_unassigned_seats:
            typeof qty === 'number' ? qty : undefined,
        };
        if (typeof qty !== 'number' || qty <= 0) {
          warnings.push(
            `subscription ${sub.id}: SEAT_BASED but could not determine a positive seat count for the package — check quantity_schedule vs linked recurring_credits.`,
          );
        }
      } else if (typeof qty === 'number') {
        row.initial_quantity = qty;
      }
      const subStart = parseIso(sub.starting_at);
      if (subStart && subStart.getTime() !== anchor.getTime()) {
        row.starting_at_offset = {
          unit: 'MONTHS',
          value: monthsFromAnchor(anchor, subStart),
        };
      }
      const subEnd = parseIso(sub.ending_before);
      if (subEnd) {
        const subDur = monthsSpan(subStart ?? anchor, subEnd);
        row.duration = { unit: 'MONTHS', value: subDur };
      }
      return row;
    },
  );

  const recurringCredits: NonNullable<PackageCreateParams['recurring_credits']> = (
    contract.recurring_credits ?? []
  ).map((rc: any) => {
    const subId = rc.subscription_config?.subscription_id as string | undefined;
    const tempSub = subId ? subscriptionIdToTemp.get(subId) : undefined;
    if (subId && !tempSub) {
      warnings.push(
        `recurring_credit references subscription_id=${subId} not found in contract.subscriptions — omitting subscription_config`,
      );
    }
    const willLinkSubscription = !!(tempSub && rc.subscription_config);
    const linkedSub = subId
      ? (contract.subscriptions ?? []).find((s: any) => s.id === subId)
      : undefined;
    const scheduleQty = linkedSub ? resolveQuantityScheduleAtAnchor(linkedSub, anchor) : undefined;
    const fromAccess = rc.access_amount?.quantity;
    // packages/create: quantity on access_amount is forbidden when subscription_config is set.
    let resolvedCreditQty: number | undefined;
    if (!willLinkSubscription) {
      resolvedCreditQty =
        typeof fromAccess === 'number' && fromAccess > 0
          ? fromAccess
          : typeof scheduleQty === 'number'
            ? scheduleQty
            : typeof fromAccess === 'number'
              ? fromAccess
              : undefined;
    }

    const rcStart = parseIso(rc.starting_at) ?? anchor;
    const rcEnd = parseIso(rc.ending_before) ?? ending;
    const row: PackageCreateParams.RecurringCredit = {
      name: rc.name,
      product_id: rc.product?.id ?? rc.product_id,
      priority: rc.priority,
      rate_type: rc.rate_type ?? 'LIST_RATE',
      applicable_product_ids: rc.applicable_product_ids,
      applicable_product_tags: rc.applicable_product_tags,
      access_amount: {
        credit_type_id:
          rc.access_amount?.credit_type_id ?? rc.access_amount?.credit_type?.id,
        unit_price: Number(rc.access_amount?.unit_price ?? 0),
        ...(typeof resolvedCreditQty === 'number' ? { quantity: resolvedCreditQty } : {}),
      },
      commit_duration: {
        value: Number(rc.commit_duration?.value ?? 1),
        unit: rc.commit_duration?.unit ?? 'PERIODS',
      },
      starting_at_offset: {
        unit: 'MONTHS',
        value: monthsFromAnchor(anchor, rcStart),
      },
      duration: { unit: 'MONTHS', value: monthsSpan(rcStart, rcEnd) },
      recurrence_frequency: rc.recurrence_frequency ?? 'MONTHLY',
      proration: rc.proration,
    };
    if (tempSub && rc.subscription_config) {
      row.subscription_config = {
        subscription_id: tempSub,
        allocation: rc.subscription_config.allocation ?? 'INDIVIDUAL',
        apply_seat_increase_config: {
          is_prorated: rc.subscription_config.apply_seat_increase_config?.is_prorated ?? false,
        },
      };
    }
    return row;
  });

  if ((contract.credits ?? []).length && (contract.recurring_credits ?? []).length) {
    warnings.push(
      'Contract has both one-time credits and recurring_credits — both are included on the package.',
    );
  }

  if ((contract.recurring_commits ?? []).length) {
    warnings.push(
      'recurring_commits on contract are not auto-mapped yet — extend metronomeContractToPackageCreate if you need them.',
    );
  }

  if ((contract.scheduled_charges ?? []).length) {
    warnings.push('scheduled_charges on contract are not copied to the package payload.');
  }

  const overridesCombined = [
    ...mapOverrides(anchor, ending, contract.overrides, warnings),
    ...mapDiscountsToListPriceMultiplierOverrides(contract, anchor, ending, options, warnings),
  ];

  const body: PackageCreateParams = {
    name: options.packageName,
    contract_name: options.contractName ?? contract.name,
    rate_card_id: rateCardId,
    duration,
    ...mapBillingFromContract(contract),
    commits: commits.length ? commits : undefined,
    credits: credits.length ? credits : undefined,
    subscriptions: subscriptions.length ? subscriptions : undefined,
    recurring_credits: recurringCredits.length ? recurringCredits : undefined,
    overrides: overridesCombined.length ? overridesCombined : undefined,
    net_payment_terms_days: contract.net_payment_terms_days,
    multiplier_override_prioritization: contract.multiplier_override_prioritization,
    usage_statement_schedule: mapUsageStatementSchedule(contract),
    scheduled_charges_on_usage_invoices: contract.scheduled_charges_on_usage_invoices,
  };

  return { body, warnings };
}
