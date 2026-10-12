'use client';

import { Header } from '@/components';
import EnterpriseHero from '@/components/landing/EnterpriseHero';
import PricingTable from '@/components/landing/PricingTable';

export default function Home() {
  return (
    <div className='grid items-center'>
      <Header />
      <EnterpriseHero />
      <PricingTable />
    </div>
  );
}
