/* eslint-disable i18next/no-literal-string */
import Link from 'next/link';
import { Database, Sprout, Trash2, Users } from 'lucide-react';

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const provisioning = [
    {
      title: 'Target account setup',
      description:
        'Preview and seed starter-owned primitives in a target account using explicit, memory-only API keys.',
      href: `/${locale}/admin/starter`,
      icon: Sprout,
    },
  ];
  const customerOperations = [
    {
      title: 'Demo customers',
      description:
        'Create Pro, Enterprise Quickstart, or B2B personas in the configured demo environment or another account.',
      href: `/${locale}/admin/customers`,
      icon: Users,
    },
    {
      title: 'Customer cleanup',
      description:
        'Choose the target, then archive selected Metronome customers and delete selected Stripe test customers.',
      href: `/${locale}/admin/cleanup-environment`,
      icon: Trash2,
    },
  ];
  return (
    <main className='min-h-screen bg-background px-6 py-12'>
      <div className='mx-auto max-w-5xl'>
        <div className='mb-8'>
          <p className='text-sm font-semibold uppercase tracking-wide text-purple'>
            Admin tools
          </p>
          <h1 className='mt-2 text-4xl font-bold text-foreground'>
            Demo environment administration
          </h1>
          <p className='mt-3 max-w-3xl text-muted-foreground'>
            Account primitives, demo customers, and destructive cleanup are
            intentionally separated. Target-account credentials are never saved
            to browser storage or environment files.
          </p>
        </div>
        {[
          {
            title: 'Provision an account',
            description:
              'Always uses explicit credentials that stay only in this Admin session.',
            items: provisioning,
          },
          {
            title: 'Customer operations',
            description:
              'Choose the configured demo environment or provide credentials for another account.',
            items: customerOperations,
          },
        ].map((group) => (
          <section key={group.title} className='mb-8'>
            <h2 className='text-lg font-semibold text-foreground'>
              {group.title}
            </h2>
            <p className='mt-1 text-sm text-muted-foreground'>
              {group.description}
            </p>
            <div className='mt-4 grid gap-6 md:grid-cols-2'>
              {group.items.map(
                ({ title, description, href, icon: Icon }) => (
                  <Link
                    key={title}
                    href={href}
                    className='rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md'
                  >
                    <Icon className='h-7 w-7 text-purple' />
                    <h3 className='mt-5 text-xl font-semibold text-foreground'>
                      {title}
                    </h3>
                    <p className='mt-3 text-sm leading-6 text-muted-foreground'>
                      {description}
                    </p>
                  </Link>
                ),
              )}
            </div>
          </section>
        ))}
        <div className='mt-8 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950'>
          <Database className='mt-0.5 h-5 w-5 flex-none' />
          <p>
            Every page identifies its target. Account setup always requires
            explicit credentials; customer operations can deliberately use the
            configured demo environment or another account.
          </p>
        </div>
      </div>
    </main>
  );
}

