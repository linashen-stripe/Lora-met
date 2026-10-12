import React from 'react';
import { cn } from '@/lib/utils';

const Skeleton = ({
  count = 1,
  className,
}: {
  count?: number;
  className?: string;
}) => {
  return (
    <>
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className={cn('animate-pulse bg-gray-200 h-4 rounded', className)}
        />
      ))}
    </>
  );
};

export default Skeleton;
