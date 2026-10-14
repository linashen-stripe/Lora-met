/* eslint-disable i18next/no-literal-string */
import Link from 'next/link';
import { Database, Sprout, Trash2, Users } from 'lucide-react';

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const sections = [
    {
      title: 'Account setup',
      description:
        'Preview and seed starter-owned primitives in a target account using explicit, memory-only API keys.',
      href: `/${locale}/admin/starter`,
      icon: Sprout,
    },
    {
      title: 'Demo customers',
      description:
        'Create Free, Pro, Enterprise Quickstart, or B2B personas and seed representative usage.',
      href: `/${locale}/admin/customers`,
      icon: Users,
    },
    {
      title: 'Customer cleanup',
      description:
        'Archive selected Metronome customers and permanently delete selected Stripe test customers.',
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
        <div className='grid gap-6 md:grid-cols-3'>
          {sections.map(({ title, description, href, icon: Icon }) => (
            <Link
              key={title}
              href={href}
              className='rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md'
            >
              <Icon className='h-7 w-7 text-purple' />
              <h2 className='mt-5 text-xl font-semibold text-foreground'>
                {title}
              </h2>
              <p className='mt-3 text-sm leading-6 text-muted-foreground'>
                {description}
              </p>
            </Link>
          ))}
        </div>
        <div className='mt-8 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950'>
          <Database className='mt-0.5 h-5 w-5 flex-none' />
          <p>
            Use environment or Tools Panel keys for this demo account. Account
            setup and starter reset require explicit target credentials and
            typed confirmation on the setup page.
          </p>
        </div>
      </div>
    </main>
  );
}

