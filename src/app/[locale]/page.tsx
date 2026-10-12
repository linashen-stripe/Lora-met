'use client';

import HeroSection from '@/components/landing/HeroSection';
import TechnologyShowcase from '@/components/landing/TechnologyShowcase';
import FeaturesSection from '@/components/landing/FeaturesSection';

export default function Home() {
  return (
    <div className='flex min-h-screen flex-col bg-background'>
      <main className='flex-1'>
        <HeroSection />
        <TechnologyShowcase />
        <FeaturesSection />
      </main>
    </div>
  );
}
