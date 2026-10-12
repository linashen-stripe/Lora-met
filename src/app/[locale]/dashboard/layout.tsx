'use client';

import Sidebar from '@/components/dashboard/Sidebar';
import React from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className='grid items-center'>
      <div className='min-h-screen bg-background flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8'>
        <div className='w-full max-w-7xl mx-auto flex flex-row space-x-10'>
          <Sidebar />
          {children}
        </div>
      </div>
    </div>
  );
}
