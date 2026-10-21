'use client';

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  AdminCredentialSource,
  ExplicitAdminCredentials,
} from '@/utils/adminCredentials';

type AdminCredentialsContextValue = {
  source: AdminCredentialSource;
  setSource: (source: AdminCredentialSource) => void;
  explicit: ExplicitAdminCredentials;
  updateExplicit: (patch: Partial<ExplicitAdminCredentials>) => void;
  resolvedTarget: string | null;
  setResolvedTarget: (target: string | null) => void;
};

const AdminCredentialsContext =
  createContext<AdminCredentialsContextValue | null>(null);

const EMPTY_EXPLICIT_CREDENTIALS: ExplicitAdminCredentials = {
  metronomeApiKey: '',
  stripeSecretKey: '',
  deliveryMethodId: '',
};

export function AdminCredentialsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [source, setSource] =
    useState<AdminCredentialSource>('configured');
  const [explicit, setExplicit] = useState<ExplicitAdminCredentials>(
    EMPTY_EXPLICIT_CREDENTIALS,
  );
  const [resolvedTarget, setResolvedTarget] = useState<string | null>(null);
  const value = useMemo(
    () => ({
      source,
      setSource,
      explicit,
      updateExplicit: (patch: Partial<ExplicitAdminCredentials>) =>
        setExplicit((current) => ({ ...current, ...patch })),
      resolvedTarget,
      setResolvedTarget,
    }),
    [explicit, resolvedTarget, source],
  );

  return (
    <AdminCredentialsContext.Provider value={value}>
      {children}
    </AdminCredentialsContext.Provider>
  );
}

export function useAdminCredentials() {
  const value = useContext(AdminCredentialsContext);
  if (!value) {
    throw new Error(
      'useAdminCredentials must be used within AdminCredentialsProvider',
    );
  }
  return value;
}
