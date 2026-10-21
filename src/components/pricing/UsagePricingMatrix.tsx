'use client';

export type UsagePricingTier = {
  key: string;
  label: string;
  description: string;
};

export type UsagePricingRow = {
  id: string;
  name: string;
  details: string[];
  billedAs: string;
  prices: Record<
    string,
    Array<{
      label?: string;
      value: string;
    }>
  >;
};

export type UsagePricingCategory = {
  id: string;
  label: string;
  description: string;
  rows: UsagePricingRow[];
};

export default function UsagePricingMatrix({
  categories,
  tiers,
  configurationLabel,
  billedAsLabel,
}: {
  categories: UsagePricingCategory[];
  tiers: UsagePricingTier[];
  configurationLabel: string;
  billedAsLabel: string;
}) {
  if (categories.length === 0) return null;

  return (
    <div className='mt-8 space-y-6 text-left'>
      {categories.map((category) => (
        <section
          key={category.id}
          className='mx-auto max-w-4xl overflow-hidden rounded-xl border border-border bg-card'
        >
          <div className='border-b border-border px-5 py-4'>
            <h3 className='text-lg font-semibold text-foreground'>
              {category.label}
            </h3>
            <p className='mt-1 text-sm text-muted-foreground'>
              {category.description}
            </p>
          </div>

          <div className='divide-y divide-border md:hidden'>
            {category.rows.map((row) => (
              <article key={row.id} className='px-4 py-4'>
                <p className='font-semibold text-foreground'>{row.name}</p>
                {row.details.length > 0 && (
                  <p className='mt-1 text-xs capitalize text-muted-foreground'>
                    {row.details.join(' · ')}
                  </p>
                )}
                <p className='mt-2 text-xs text-muted-foreground'>
                  {billedAsLabel}: {row.billedAs}
                </p>
                <div className='mt-4 grid grid-cols-2 gap-3'>
                  {tiers.map((tier) => (
                    <div key={tier.key} className='rounded-lg bg-muted/60 p-3'>
                      <p className='text-xs font-semibold text-foreground'>
                        {tier.label}
                      </p>
                      {tier.description && (
                        <p className='mb-2 text-[11px] text-muted-foreground'>
                          {tier.description}
                        </p>
                      )}
                      {(row.prices[tier.key] ?? []).map((price) => (
                        <p
                          key={`${price.label ?? 'price'}-${price.value}`}
                          className='text-sm leading-5 text-foreground'
                        >
                          {price.label && (
                            <span className='mr-1 text-xs text-muted-foreground'>
                              {price.label}
                            </span>
                          )}
                          <span className='font-bold tabular-nums'>
                            {price.value}
                          </span>
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className='hidden overflow-x-auto md:block'>
            <table className='w-full min-w-[720px] table-fixed border-collapse'>
              <colgroup>
                <col className='w-[36%]' />
                <col className='w-[18%]' />
                {tiers.map((tier) => (
                  <col
                    key={tier.key}
                    style={{ width: `${46 / tiers.length}%` }}
                  />
                ))}
              </colgroup>
              <thead className='bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground'>
                <tr>
                  <th className='px-5 py-3 text-left font-semibold'>
                    {configurationLabel}
                  </th>
                  <th className='px-5 py-3 text-left font-semibold'>
                    {billedAsLabel}
                  </th>
                  {tiers.map((tier) => (
                    <th
                      key={tier.key}
                      className='px-5 py-3 text-right font-semibold'
                    >
                      <span className='block text-foreground'>{tier.label}</span>
                      {tier.description && (
                        <span className='mt-0.5 block normal-case font-normal tracking-normal'>
                          {tier.description}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className='divide-y divide-border'>
                {category.rows.map((row) => (
                  <tr key={row.id} className='align-top hover:bg-muted/30'>
                    <td className='px-5 py-4'>
                      <p className='font-semibold text-foreground'>{row.name}</p>
                      <div className='mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground'>
                        {row.details.map((detail) => (
                          <span key={detail}>{detail}</span>
                        ))}
                      </div>
                    </td>
                    <td className='whitespace-nowrap px-5 py-4 text-sm text-foreground'>
                      {row.billedAs}
                    </td>
                    {tiers.map((tier) => (
                      <td
                        key={tier.key}
                        className='whitespace-nowrap px-5 py-4 text-right'
                      >
                        <div className='min-h-10'>
                          {(row.prices[tier.key] ?? []).map((price) => (
                            <p
                              key={`${price.label ?? 'price'}-${price.value}`}
                              className='text-sm leading-5 text-foreground'
                            >
                              {price.label && (
                                <span className='mr-1 text-xs text-muted-foreground'>
                                  {price.label}
                                </span>
                              )}
                              <span className='font-bold tabular-nums'>
                                {price.value}
                              </span>
                            </p>
                          ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
