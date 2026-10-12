/* eslint-disable i18next/no-literal-string */
'use client';

import { Box, Code2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useConfigContext } from '@/contexts/ConfigContext';
import type { DemoMode } from '@/config/demoModes';

export default function DemoModeSwitcher({ locale }: { locale: string }) {
  const { demoMode, updateDemoMode } = useConfigContext();
  const pathname = usePathname();
  const router = useRouter();
  const isBuilder = demoMode === 'ai-builder';

  const selectMode = (mode: DemoMode) => {
    updateDemoMode(mode);

    if (pathname.includes('/demos/')) {
      router.push(`/${locale}/demos/${mode}`);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set('demoMode', mode);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium text-gray-700'>Demo experience</p>
      <div className='grid grid-cols-2 gap-1 rounded-xl border border-violet-200 bg-violet-50 p-1'>
      <button
        type='button'
        onClick={() => selectMode('generation')}
        className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition ${
          !isBuilder
            ? 'bg-white text-purple shadow-sm'
            : 'text-violet-700 hover:bg-white/60'
        }`}
      >
        <Box className='h-3.5 w-3.5' />
        Generate
      </button>
      <button
        type='button'
        onClick={() => selectMode('ai-builder')}
        className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition ${
          isBuilder
            ? 'bg-white text-purple shadow-sm'
            : 'text-violet-700 hover:bg-white/60'
        }`}
      >
        <Code2 className='h-3.5 w-3.5' />
        AI Builder
      </button>
      </div>
    </div>
  );
}
