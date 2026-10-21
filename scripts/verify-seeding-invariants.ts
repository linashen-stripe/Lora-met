import assert from 'node:assert/strict';
import aiBuilderManifest from '../config/metronome/ai-builder-starter.json';
import {
  eventProductKeyFromTokenProductName,
  seedMetronomeUsage,
} from '../src/utils/metronomeSeedUsage';
import {
  assertB2bSeatTargets,
  b2bSeatConsumptionTargets,
  demoB2bContractStart,
  demoB2bCurrentPeriodLookbackDays,
  demoB2bUsageStart,
  demoContractStart,
  expectedB2bSpillSeatCount,
  listRateTargetsForConsumption,
  preparedProConsumptionFraction,
  quickstartConsumptionFraction,
  type DemoUsageStory,
} from '../src/utils/demoUsageSeedProfiles';
import { seedGenerationUsage } from '../src/utils/metronomeGenerationSeedUsage';

const STORIES: DemoUsageStory[] = ['healthy', 'at-risk', 'burst'];
const GENERATION_SEAT_CREDITS = 10_000;
const AI_BUILDER_SEAT_DOLLARS = 2_000;
const B2B_MULTIPLIER = 0.85;

function verifyAiBuilderProductNameMapping(): void {
  assert.deepEqual(
    eventProductKeyFromTokenProductName('Build - Code Assist Input Tokens'),
    { productKey: 'code_assist', direction: 'input' },
  );
  assert.deepEqual(
    eventProductKeyFromTokenProductName('Build - Chat Output Tokens'),
    { productKey: 'chat', direction: 'output' },
  );
  assert.deepEqual(
    eventProductKeyFromTokenProductName('Build - Voice - Input Tokens'),
    { productKey: 'voice', direction: 'input' },
  );
  assert.deepEqual(
    eventProductKeyFromTokenProductName('Chat - Output Tokens'),
    { productKey: 'chat', direction: 'output' },
  );
}

function verifyRollingContractStart(): void {
  const now = new Date('2026-10-16T07:00:00.000Z');
  assert.equal(
    demoContractStart(now).toISOString(),
    '2026-09-18T00:00:00.000Z',
  );
  assert.equal(
    demoB2bContractStart(now).toISOString(),
    '2026-09-01T00:00:00.000Z',
  );
  assert.equal(
    demoB2bUsageStart(now).toISOString(),
    '2026-10-01T00:00:00.000Z',
  );
  assert.equal(demoB2bCurrentPeriodLookbackDays(now), 15);
}

function verifySharedB2bProfiles(): void {
  for (const story of STORIES) {
    for (const allocation of [
      GENERATION_SEAT_CREDITS,
      AI_BUILDER_SEAT_DOLLARS,
    ]) {
      const targets = b2bSeatConsumptionTargets(allocation, story);
      assertB2bSeatTargets(
        allocation,
        targets,
        expectedB2bSpillSeatCount(story),
      );
      const listRateTargets = listRateTargetsForConsumption(
        targets,
        B2B_MULTIPLIER,
      );
      listRateTargets.forEach((target, index) => {
        assert.ok(
          Math.abs(target * B2B_MULTIPLIER - targets[index]) < 1e-8,
        );
      });
    }
  }
}

async function verifyGenerationB2bEvents(): Promise<void> {
  for (const story of STORIES) {
    const batches: any[][] = [];
    const metronome = {
      v2: {
        contracts: {
          list: async () => ({
            data: [
              {
                id: `contract-${story}`,
                starting_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
                commits: [
                  {
                    access_schedule: {
                      schedule_items: [{ amount: 1_000_000 }],
                    },
                    balance: 1_000_000,
                  },
                ],
                credits: [],
              },
            ],
          }),
        },
      },
      v1: {
        usage: {
          ingest: async ({ usage }: { usage: any[] }) => {
            batches.push(usage);
          },
        },
      },
    } as any;
    const users = ['seat-a', 'seat-b', 'seat-c', 'seat-d', 'seat-e'];
    const targets = b2bSeatConsumptionTargets(
      GENERATION_SEAT_CREDITS,
      story,
    );
    await seedGenerationUsage({
      metronome,
      customerId: `customer-${story}`,
      story,
      lookbackDays: 15,
      trailingUnseededDays: 0,
      usageUserIds: users,
      perUserTargetCredits: targets,
      usageMultiplier: B2B_MULTIPLIER,
      seedRunKey: `contract-${story}`,
    });
    const events = batches.flat();
    const consumedByUser = new Map(users.map((user) => [user, 0]));
    for (const event of events) {
      assert.ok(Number.isInteger(event.properties.quantity));
      consumedByUser.set(
        event.properties.user_id,
        (consumedByUser.get(event.properties.user_id) ?? 0) +
          Number(event.properties.credits_consumed) * B2B_MULTIPLIER,
      );
    }
    const actual = users.map((user) => consumedByUser.get(user) ?? 0);
    const expectedSpillSeats = expectedB2bSpillSeatCount(story);
    assert.equal(
      actual.filter((amount) => amount > GENERATION_SEAT_CREDITS).length,
      expectedSpillSeats,
    );
    assert.equal(
      actual.filter(
        (amount) => amount > 0 && amount < GENERATION_SEAT_CREDITS,
      ).length,
      5 - expectedSpillSeats,
    );
    assert.equal(new Set(actual.map((amount) => Math.round(amount))).size, 5);
    assert.deepEqual(
      new Set(events.map((event) => event.properties.modality)),
      new Set(['image', 'video', '3d']),
    );
    assert.deepEqual(
      new Set(events.map((event) => event.properties.service_tier)),
      new Set(['standard', 'priority']),
    );
    assert.equal(
      new Set(events.map((event) => event.properties.project_id)).size,
      3,
    );
  }
}

async function verifyGenerationPreparedPlans(): Promise<void> {
  for (const story of STORIES) {
    const batches: any[][] = [];
    const metronome = {
      v2: {
        contracts: {
          list: async () => ({
            data: [
              {
                id: `pro-${story}`,
                starting_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
                commits: [
                  {
                    name: 'Seeded Pro Auto Top-Up',
                    access_schedule: {
                      schedule_items: [{ amount: 1_500 }],
                    },
                    balance: 1_500,
                  },
                ],
                credits: [
                  {
                    access_schedule: {
                      schedule_items: [{ amount: 1_000 }],
                    },
                    balance: 1_000,
                  },
                ],
              },
            ],
          }),
        },
      },
      v1: {
        usage: {
          ingest: async ({ usage }: { usage: any[] }) => batches.push(usage),
        },
      },
    } as any;
    const result = await seedGenerationUsage({
      metronome,
      customerId: `pro-customer-${story}`,
      story,
      usageUserIds: ['creator@example.com'],
      persona: 'pro',
    });
    const targetFraction = preparedProConsumptionFraction(story);
    assert.ok(result.creditsConsumed <= 1_000 * targetFraction);
    assert.ok(result.creditsConsumed >= 1_000 * targetFraction - 10);
    const events = batches.flat();
    assert.ok(events.every((event) => Number.isInteger(event.properties.quantity)));
    assert.deepEqual(
      new Set(events.map((event) => event.properties.modality)),
      new Set(['image', 'video', '3d']),
    );
    assert.deepEqual(
      new Set(events.map((event) => event.properties.service_tier)),
      new Set(['standard', 'priority']),
    );
  }
}

async function verifyAiBuilderProEconomics(): Promise<void> {
  const rates = aiBuilderManifest.rates.map((rate) => {
    const metric = aiBuilderManifest.metrics.find(
      (candidate) => candidate.key === rate.metric,
    )!;
    return {
      product_id: rate.metric,
      product_name: metric.name,
      rate: { price: rate.centsPerMillionTokens },
      pricing_group_values: {
        model: rate.model,
        processing_tier: rate.processingTier,
      },
    };
  });
  for (const story of STORIES) {
    const batches: any[][] = [];
    const contract = {
      id: `ai-pro-${story}`,
      starting_at: '2026-09-18T00:00:00.000Z',
      rate_card_id: 'ai-rate-card',
      // Regression fixture: v2 can expose the current recurring credit, its
      // next period, and an auto-top-up together. Pro pacing must ignore the
      // latter two rather than targeting a percentage of this $55 total.
      commits: [
        {
          name: 'Seeded Pro Auto Top-Up',
          access_schedule: {
            schedule_items: [
              {
                amount: 1_500,
                starting_at: '2026-09-18T00:00:00.000Z',
                ending_before: '2027-10-18T00:00:00.000Z',
              },
            ],
          },
          balance: 1_500,
        },
      ],
      credits: [
        {
          name: 'Pro monthly USD credit',
          access_schedule: {
            schedule_items: [
              {
                amount: 2_000,
                starting_at: '2026-09-18T00:00:00.000Z',
                ending_before: '2026-10-18T00:00:00.000Z',
              },
            ],
          },
          balance: 2_000,
        },
        {
          name: 'Pro monthly USD credit',
          access_schedule: {
            schedule_items: [
              {
                amount: 2_000,
                starting_at: '2026-10-18T00:00:00.000Z',
                ending_before: '2026-11-18T00:00:00.000Z',
              },
            ],
          },
          balance: 0,
        },
      ],
    };
    const metronome = {
      v2: {
        contracts: {
          list: async () => ({ data: [contract] }),
          retrieve: async () => ({ data: contract }),
        },
      },
      v1: {
        contracts: {
          rateCards: {
            retrieve: async () => ({
              data: { fiat_credit_type: { name: 'USD' } },
            }),
            rates: {
              list: () => ({
                async *[Symbol.asyncIterator]() {
                  for (const rate of rates) yield rate;
                },
              }),
            },
          },
        },
        usage: {
          ingest: async ({ usage }: { usage: any[] }) => batches.push(usage),
        },
      },
    } as any;
    const originalConsoleLog = console.log;
    console.log = () => undefined;
    let result: Awaited<ReturnType<typeof seedMetronomeUsage>>;
    try {
      result = await seedMetronomeUsage({
        metronome,
        customerId: `ai-pro-customer-${story}`,
        contractId: contract.id,
        story,
        persona: 'pro',
        logLabel: `[verify-ai-pro:${story}]`,
        trailingUnseededDays: 1,
        projectAttribution: {
          mode: 'single',
          projectId: 'project-atlas',
        },
        transactionIdPrefix: 'seed',
        usageUserIds: ['creator@example.com'],
      });
    } finally {
      console.log = originalConsoleLog;
    }
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    const expectedSpend = 20 * preparedProConsumptionFraction(story);
    assert.ok(
      Math.abs(result.estimatedSpendDollars - expectedSpend) < 0.02,
      `AI Builder Pro ${story} spend was $${result.estimatedSpendDollars.toFixed(2)}, expected $${expectedSpend.toFixed(2)}`,
    );
  }
}

async function verifyAiBuilderQuickstartEconomics(): Promise<void> {
  const batches: any[][] = [];
  const rates = aiBuilderManifest.rates.map((rate) => {
    const metric = aiBuilderManifest.metrics.find(
      (candidate) => candidate.key === rate.metric,
    )!;
    return {
      product_id: rate.metric,
      product_name: metric.name,
      rate: { price: rate.centsPerMillionTokens },
      pricing_group_values: {
        model: rate.model,
        processing_tier: rate.processingTier,
      },
    };
  });
  const contract = {
    id: 'ai-quickstart-contract',
    starting_at: '2026-09-18T00:00:00.000Z',
    ending_before: '2027-09-18T00:00:00.000Z',
    rate_card_id: 'ai-rate-card',
    commits: [
      {
        access_schedule: {
          schedule_items: [{ amount: 250_000 }],
        },
        balance: 250_000,
      },
    ],
    credits: [],
  };
  const metronome = {
    v2: {
      contracts: {
        list: async () => ({ data: [contract] }),
        retrieve: async () => ({ data: contract }),
      },
    },
    v1: {
      contracts: {
        rateCards: {
          retrieve: async () => ({
            data: { fiat_credit_type: { name: 'USD' } },
          }),
          rates: {
            list: () => ({
              async *[Symbol.asyncIterator]() {
                for (const rate of rates) yield rate;
              },
            }),
          },
        },
      },
      usage: {
        ingest: async ({ usage }: { usage: any[] }) => batches.push(usage),
      },
    },
  } as any;

  const originalConsoleLog = console.log;
  console.log = () => undefined;
  let result: Awaited<ReturnType<typeof seedMetronomeUsage>>;
  try {
    result = await seedMetronomeUsage({
      metronome,
      customerId: 'ai-quickstart-customer',
      contractId: contract.id,
      story: 'healthy',
      persona: 'quickstart',
      logLabel: '[verify-ai-quickstart]',
      trailingUnseededDays: 1,
      projectAttribution: { mode: 'single', projectId: 'project-atlas' },
      transactionIdPrefix: 'seed',
      usageUserIds: ['creator@example.com'],
    });
  } finally {
    console.log = originalConsoleLog;
  }
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(Math.abs(result.estimatedSpendDollars - 250) < 0.01);
  assert.ok(
    batches
      .flat()
      .every(
        (event) =>
          new Date(event.timestamp).getTime() >=
          new Date(contract.starting_at).getTime(),
      ),
    'AI Builder events must not predate the contract.',
  );
  assert.ok(
    batches
      .flat()
      .every(
        (event) =>
          typeof event.properties.workspace_id === 'string' &&
          event.properties.workspace_id.length > 0,
      ),
    'AI Builder events must include workspace_id required by every billable metric.',
  );

  const rateByEventDimensions = new Map(
    aiBuilderManifest.rates.map((rate) => {
      const metric = aiBuilderManifest.metrics.find(
        (candidate) => candidate.key === rate.metric,
      )!;
      return [
        `${metric.apiProduct}:${metric.aggregationKey}:${rate.model}:${rate.processingTier}`,
        rate.centsPerMillionTokens,
      ];
    }),
  );
  const actualSpendDollars = batches.flat().reduce((total, event) => {
    const properties = event.properties;
    return (
      total +
      (['input_tokens', 'output_tokens'] as const).reduce(
        (eventTotal, aggregationKey) => {
          const centsPerMillion = rateByEventDimensions.get(
            `${properties.api_product}:${aggregationKey}:${properties.model}:${properties.processing_tier}`,
          );
          assert.ok(
            centsPerMillion != null,
            `Missing AI Builder rate for ${properties.api_product}/${aggregationKey}/${properties.model}/${properties.processing_tier}`,
          );
          return (
            eventTotal +
            (Number(properties[aggregationKey]) / 1_000_000) *
              (Number(centsPerMillion) / 100)
          );
        },
        0,
      )
    );
  }, 0);
  assert.ok(
    Math.abs(actualSpendDollars - 250) < 0.02,
    `AI Builder Quickstart events rate to $${actualSpendDollars.toFixed(2)}, expected $250.00`,
  );
}

async function main(): Promise<void> {
  verifyAiBuilderProductNameMapping();
  verifyRollingContractStart();
  verifySharedB2bProfiles();
  const oneMonthStart = new Date('2026-09-17T00:00:00.000Z');
  const oneYearEnd = new Date('2027-09-17T00:00:00.000Z');
  const profileNow = new Date('2026-10-16T00:00:00.000Z');
  assert.equal(
    quickstartConsumptionFraction({
      story: 'healthy',
      startingAt: oneMonthStart,
      endingBefore: oneYearEnd,
      now: profileNow,
    }),
    0.1,
  );
  assert.equal(
    quickstartConsumptionFraction({
      story: 'at-risk',
      startingAt: oneMonthStart,
      endingBefore: oneYearEnd,
      now: profileNow,
    }),
    0.15,
  );
  assert.equal(
    quickstartConsumptionFraction({
      story: 'burst',
      startingAt: oneMonthStart,
      endingBefore: oneYearEnd,
      now: profileNow,
    }),
    0.12,
  );
  await verifyGenerationB2bEvents();
  await verifyGenerationPreparedPlans();
  await verifyAiBuilderProEconomics();
  await verifyAiBuilderQuickstartEconomics();
  console.log(
    'Seeding invariants verified: AI rate-to-token economics, mode-specific units, bounded Pro usage, term-paced Quickstart usage, whole Generation quantities, profile-specific B2B spill seats, distinct retained balances, and dimensional coverage.',
  );
}

void main();
