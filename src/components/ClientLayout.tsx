'use client';

import { useRef, useEffect } from 'react';
import { ConfigProvider, useConfigContext } from '@/contexts/ConfigContext';
import { CartProvider } from '@/contexts/CartContext';
import { UsageChartRefreshProvider } from '@/contexts/UsageChartRefreshContext';
import QueryProvider from './QueryProvider';
import ToolsPanel from './config/ToolsPanel';
import { Footer, NavBar } from '@/components';
import ThemeOverrides from './ThemeOverrides';
import UmamiTracker from './UmamiTracker';
import {
  ApiInspectorProvider,
} from '@/contexts/ApiInspectorContext';
import ApiInspectorPanel from '@/components/ApiInspectorPanel';

interface AppContentProps {
  children: React.ReactNode;
}

interface CustomCSSProperties extends React.CSSProperties {
  '--transition-duration'?: string;
}

function AppContent({ children }: AppContentProps) {
  const { isToolsPanelOpen } = useConfigContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isToolsPanelOpen) {
      window.scrollTo(0, 0);
      scrollContainerRef.current?.scrollTo(0, 0);
    }
  }, [isToolsPanelOpen]);

  const containerClasses = `
    flex-grow transition-all ease-in-out
    ${
      isToolsPanelOpen
        ? 'overflow-hidden shadow-xl md:translate-x-[calc(120px+18%)] md:translate-y-[5vh] md:scale-x-[0.68] md:scale-y-[0.72] lg:translate-x-[calc(108px+15%)] lg:scale-x-[0.73] lg:scale-y-[0.77] xl:translate-x-[calc(105px+11%)] xl:scale-x-[0.81] xl:scale-y-[0.85] md:border md:border-gray-200 md:rounded-xl'
        : 'md:translate-x-0 md:translate-y-0 md:scale-100 lg:translate-x-0 lg:scale-100 xl:translate-x-0 xl:scale-100'
    }
    transform origin-top-left
    bg-white
  `;

  const containerStyle: CustomCSSProperties = {
    '--transition-duration': isToolsPanelOpen ? '700ms' : '300ms',
    transitionDuration: 'var(--transition-duration)',
  };

  return (
    <div
      className={`flex flex-col ${
        isToolsPanelOpen ? 'h-screen overflow-hidden' : 'min-h-screen'
      } bg-pattern`}
    >
      <ToolsPanel />
      <ApiInspectorPanel />
      <UmamiTracker />
      <div
        id='app-container'
        className={containerClasses}
        style={containerStyle}
      >
        <div
          ref={scrollContainerRef}
          className={`flex flex-col ${
            isToolsPanelOpen ? 'h-screen overflow-y-auto' : 'min-h-full'
          }`}
        >
          <NavBar />
          <main className=' bg-background'>{children}</main>
          <Footer />
        </div>
      </div>
    </div>
  );
}

interface ClientLayoutProps {
  children: React.ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  return (
    <QueryProvider>
      <ConfigProvider>
        <ApiInspectorProvider>
          <CartProvider>
            <UsageChartRefreshProvider>
              <ThemeOverrides />
              <AppContent>{children}</AppContent>
            </UsageChartRefreshProvider>
          </CartProvider>
        </ApiInspectorProvider>
      </ConfigProvider>
    </QueryProvider>
  );
}
