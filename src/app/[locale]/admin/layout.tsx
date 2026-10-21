import type { ReactNode } from 'react';
import { AdminCredentialsProvider } from '@/contexts/AdminCredentialsContext';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminCredentialsProvider>{children}</AdminCredentialsProvider>;
}
