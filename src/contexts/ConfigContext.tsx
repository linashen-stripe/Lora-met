'use client';

import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  PropsWithChildren,
} from 'react';
import i18n from '@/i18n';
import { defaultDemoSettings, supportedLanguages } from '@/config/config';
import {
  DEFAULT_METRONOME_CUSTOMER_ID,
  getEffectiveMetronomeCustomerId,
} from '@/config/metronomeDefaults';
import {
  extractLocale,
  generateRandomCustomerEmail,
  generateRandomCustomerToken,
} from '@/utils/helpers';
import { loadFromStorage, saveToStorage } from '@/utils/clientStorage';
import { LoadingOverlay } from '@/components';
import { getEnv } from '@/config/customizationConfig';
import { usePathname, useSearchParams } from 'next/navigation';
import { debounceTrack } from '@/utils/tracking';
import fetchClient from '@/utils/fetchClient';
import {
  metronomeContractPoolCapCents,
  metronomeContractScheduleAndBalanceSums,
  normalizeMetronomeSpendableSumCents,
  pickPrimaryMetronomeContract,
  resolveCreditTypeIdFromContract,
  resolveCreditTypeNameFromContract,
} from '@/utils/metronomeContractPool';
import { MetronomeContract, MetronomeCreditItem } from '@/utils/types';
import {
  customerStorageKey,
  normalizeDemoMode,
  type DemoMode,
} from '@/config/demoModes';

interface Settings {
  language: string;
  [key: string]: any;
}

interface Customer {
  /** Primary app id (Metronome customer id after sign-up). */
  id: string;
  email: string;
  metronomeCustomerId?: string;
  /** Stripe Customer id (`cus_…`) for Billing / Checkout APIs. */
  stripeCustomerId?: string;
  [key: string]: any;
}

interface Plan {
  id: string;
  lookupKey: string;
  displayName: string;
}

interface Subscription {
  id: string;
  status: string;
  billingCadenceId: string;
}

interface State {
  settings: Settings | null;
  customer: Customer | null;
  plan: Plan | null;
  subscription: Subscription | null;
  metronomeContract: MetronomeContract | null;
  metronomeContractLoaded: boolean;
  isLoading: boolean;
  isToolsPanelOpen: boolean;
  refreshElements: number;
}

interface ConfigContextType extends State {
  demoMode: DemoMode;
  updateDemoMode: (mode: DemoMode) => void;
  updateSetting: (key: string, value: any) => void;
  updateCustomer: (newCustomer: Partial<Customer>) => void;
  updatePlan: (newPlan: Partial<Plan>) => void;
  updateSubscription: (newSubscription: Partial<Subscription>) => void;
  updateState: (newState: Partial<State>) => void;
  triggerElementsRefresh: () => void;
  toggleToolsPanel: (panelName: string) => void;
  resetSettings: () => void;
  triggerSubscriptionRefresh: () => Promise<void>;
  triggerMetronomeContractRefresh: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

const toggleToolsPanel = (state: State, panelName: string): State => ({
  ...state,
  [panelName]: !state[panelName as keyof State],
});

const resetSettings = (): void => {
  try {
    localStorage.clear();
  } catch (error) {
    console.error('Failed to clear localStorage:', error);
  }

  window.location.href = '/default';
};

export function ConfigProvider({ children }: PropsWithChildren<unknown>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeDemoMode: DemoMode | null = pathname.includes('/demos/ai-builder')
    ? 'ai-builder'
    : pathname.includes('/demos/generation')
      ? 'generation'
      : searchParams.has('demoMode')
        ? normalizeDemoMode(searchParams.get('demoMode'))
        : null;
  const [preferredDemoMode, setPreferredDemoMode] =
    useState<DemoMode>('generation');
  const demoMode = routeDemoMode ?? preferredDemoMode;
  const previousDemoMode = useRef<DemoMode>(demoMode);
  const [state, setState] = useState<State>({
    settings: null,
    customer: null,
    plan: null,
    subscription: null,
    metronomeContract: null,
    metronomeContractLoaded: false,
    isLoading: true,
    isToolsPanelOpen: false,
    refreshElements: 0,
  });
  const updateState = useCallback((newState: Partial<State>) => {
    setState((prevState) => {
      const updatedState = { ...prevState, ...newState };

      ['settings', 'customer'].forEach((key) => {
        if (newState[key as keyof State]) {
          try {
            if (!searchParams.toString().includes('demogen_')) {
              let dataToSave = updatedState[key as keyof State];

              // Filter out environment-sourced branding values before saving to localStorage
              if (key === 'settings') {
                const {
                  primaryColor,
                  backgroundColor,
                  customLogo,
                  ...settingsWithoutEnvValues
                } = (dataToSave as Settings) || {};

                dataToSave = settingsWithoutEnvValues;
              }

              if (key === 'customer') {
                // Filter out customer fields that should not be persisted
                // Note: testClockId IS persisted so it's available immediately on page load
                const { activeSubscription, ...customerToPersist } =
                  (dataToSave as Customer) || {};

                dataToSave = customerToPersist;
              }

              saveToStorage(
                key === 'customer' ? customerStorageKey(demoMode) : key,
                dataToSave,
              );
            }
          } catch (error) {
            console.error(`Failed to save ${key} to storage:`, error);
          }
        }
      });

      return updatedState;
    });
  }, [demoMode, searchParams]);

  const updateDemoMode = useCallback((mode: DemoMode) => {
    setPreferredDemoMode(mode);
    saveToStorage('demoMode', mode);
  }, []);

  useEffect(() => {
    if (routeDemoMode) {
      updateDemoMode(routeDemoMode);
      return;
    }
    setPreferredDemoMode(
      normalizeDemoMode(loadFromStorage('demoMode', 'generation')),
    );
  }, [routeDemoMode, updateDemoMode]);

  useEffect(() => {
    const loadInitialState = () => {
      try {
        getEnv().then((env) => {
          let locale = extractLocale(window.location.href);

          // Search param overrides
          const params: { [anyProp: string]: string } = {};
          searchParams.forEach((value, key) => {
            if (!key.toLowerCase().includes('demogen_')) {
              return;
            }

            if (key.toLowerCase().includes('color')) {
              value = `#${value}`;
            }

            params[key.replace(/demogen_/g, '')] = value;
          });

          // Handle default locale
          if (locale === 'default') {
            const defaultLanguage =
              loadFromStorage('settings', {})?.language || env.language || 'en';
            window.location.replace(`/${defaultLanguage}`);
            locale = defaultLanguage;
          }

          // Load settings from localStorage, but exclude env-only branding properties
          // Note: stripePublishableKey and stripeSecretKey are user-customizable, so we DO load them from localStorage
          const storedSettings = loadFromStorage('settings', {});
          const {
            primaryColor: _,
            backgroundColor: __,
            customLogo: ___,
            ...localStorageSettings
          } = storedSettings;

          const settings = {
            ...defaultDemoSettings,
            ...localStorageSettings,
            // Ensure env branding values always take precedence
            primaryColor: env.primaryColor,
            backgroundColor: env.backgroundColor,
            customLogo: env.customLogo,
            ...(locale ? { language: locale } : {}),
            // Currency fallback: localStorage > env > default (must come before params)
            currency: localStorageSettings.currency || env.currency || 'usd',
            stripePublishableKey:
              localStorageSettings.stripePublishableKey ||
              env.stripePublishableKey ||
              defaultDemoSettings.stripePublishableKey,
            // Metronome: env fallback when not set via Tools panel
            metronomeApiKey: localStorageSettings.metronomeApiKey || env.metronomeApiKey,
            metronomeDeliveryMethodId: localStorageSettings.metronomeDeliveryMethodId || env.metronomeDeliveryMethodId,
            // URL params override everything (must come last)
            ...params,
          };

          // Title replacement
          if (env.isDemogen) {
            document.title = 'Stripe Demo';
          }

          const legacyGenerationCustomer = loadFromStorage('customer', {
            email: generateRandomCustomerEmail(),
          });
          let customer = loadFromStorage(
            customerStorageKey(demoMode),
            demoMode === 'generation'
              ? legacyGenerationCustomer
              : { email: generateRandomCustomerEmail() },
          );
          if (customer?.id) {
            customer = {
              ...customer,
              metronomeCustomerId:
                customer.metronomeCustomerId || DEFAULT_METRONOME_CUSTOMER_ID,
            };
          }

          updateState({
            settings,
            customer,
            isLoading: false,
          });
          i18n.changeLanguage(settings.language);
        });
      } catch (error) {
        console.error('Failed to load initial state:', error);
        updateState({ isLoading: false });
      }
    };

    loadInitialState();
  }, [demoMode, searchParams, updateState]);

  useEffect(() => {
    if (previousDemoMode.current === demoMode || state.isLoading) return;
    previousDemoMode.current = demoMode;
    const customer = loadFromStorage(customerStorageKey(demoMode), {
      email: generateRandomCustomerEmail(),
    });
    setState((current) => ({
      ...current,
      customer,
      plan: null,
      subscription: null,
      metronomeContract: null,
      metronomeContractLoaded: false,
    }));
  }, [demoMode, state.isLoading]);

  const fetchPlanAndSubscription = useCallback(async () => {
    const customerId = state.customer?.id;
    if (customerId) {
      try {
        const { data } = await fetchClient.get(
          `/api/stripe/customer/${customerId}/pricing-plan-subscription`,
        );

        if (data?.pricing_plan && data?.subscription) {
          const isActive = data.subscription.servicing_status === 'active';
          const updates: any = {
            plan: {
              id: data.pricing_plan.id,
              lookupKey: data.pricing_plan.lookup_key,
              displayName: data.pricing_plan.display_name,
            },
            subscription: {
              id: data.subscription.id,
              status: data.subscription.servicing_status,
              billingCadenceId: data.subscription.billing_cadence,
            },
          };

          // Update/augment customer data and set activeSubscription flag for UI locking
          // Normalize Stripe's snake_case test_clock to our camelCase testClockId
          const stripeCustomer = data.subscription?.customer || {};
          const { test_clock, ...otherCustomerFields } = stripeCustomer;

          const stripeMeta = (
            stripeCustomer as { metadata?: { metronome_customer_id?: string } }
          )?.metadata;
          updates.customer = {
            ...state.customer,
            ...otherCustomerFields,
            testClockId: test_clock,
            activeSubscription: isActive,
            metronomeCustomerId:
              stripeMeta?.metronome_customer_id ||
              state.customer?.metronomeCustomerId ||
              DEFAULT_METRONOME_CUSTOMER_ID,
          };

          updateState(updates);
        }
      } catch (error) {
        console.error('Failed to fetch plan and subscription:', error);
      }
    }
  }, [state.customer?.id]);

  useEffect(() => {
    const customerId = state.customer?.id;
    if (customerId) {
      // Get the customer's pricing plan subscription
      fetchPlanAndSubscription();
    }
  }, [state.customer?.id, updateState]);

  const fetchMetronomeContracts = useCallback(async () => {
    const metronomeCustomerId = getEffectiveMetronomeCustomerId(state.customer);
    if (!metronomeCustomerId) return;

    try {
      const { data } = await fetchClient.get(
        `/api/metronome/customer/${metronomeCustomerId}/contracts`,
      );

      const contracts: any[] = data.contracts ?? [];
      const topUpTotalCents: number = data.topUpTotalCents ?? 0;
      if (contracts.length === 0) {
        updateState({ metronomeContract: null, metronomeContractLoaded: true });
        return;
      }

      /** Non-archived contracts; prefer those with balance, then largest pool, then newest. */
      const pickPrimaryContract = (list: any[]) => {
        const active = list.filter(
          (c) =>
            c.archived_at == null &&
            (c.status == null ||
              (String(c.status).toUpperCase() !== 'ARCHIVED' &&
                String(c.status).toLowerCase() !== 'archived')),
        );
        const pool = active.length ? active : list;
        return pickPrimaryMetronomeContract(pool);
      };

      const contract = pickPrimaryContract(contracts);
      if (!contract) {
        updateState({ metronomeContract: null, metronomeContractLoaded: true });
        return;
      }
      const allItems = [
        ...(contract.commits ?? []),
        ...(contract.credits ?? []),
      ];

      // For commits, prefer those that started this calendar month (handles the
      // dual-commit case where a backdated commit is depleted and a fresh one was added).
      // Fall back to any commit whose access_schedule window contains today.
      // Credits are always additive — never filter to "this month only"; use isActivePeriod.
      const now = new Date();
      const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const isStartedThisMonth = (item: any): boolean => {
        const si = (item.access_schedule?.schedule_items ?? [])[0];
        if (!si?.starting_at) return false;
        return new Date(si.starting_at) >= startOfCurrentMonth;
      };

      const isActivePeriod = (item: any): boolean => {
        const scheduleItems: any[] = item.access_schedule?.schedule_items ?? [];
        if (scheduleItems.length === 0) return true;
        return scheduleItems.some((si: any) => {
          const start = si.starting_at ? new Date(si.starting_at) : null;
          const end   = si.ending_before ? new Date(si.ending_before) : null;
          return (!start || start <= now) && (!end || end > now);
        });
      };

      const thisMonthCommits = (contract.commits ?? []).filter(isStartedThisMonth);
      const activeCommits = thisMonthCommits.length > 0
        ? thisMonthCommits
        : (contract.commits ?? []).filter(isActivePeriod);
      // Credits are additive top-ups — include all that are within their access window.
      const activeCredits = (contract.credits ?? []).filter(isActivePeriod);
      const activeItems   = [...activeCommits, ...activeCredits];

      // Fall back to all items when no active commits AND no active credits (e.g. billing
      // period boundary where the commit just expired but the new one hasn't been issued yet).
      const itemsForPool = activeItems.length > 0 ? activeItems : allItems;

      const { scheduleSum, balanceSum: rawBalanceSum } =
        metronomeContractScheduleAndBalanceSums({ commits: activeItems.filter(i => (contract.commits ?? []).includes(i)), credits: activeItems.filter(i => (contract.credits ?? []).includes(i)) });

      const poolCap = metronomeContractPoolCapCents({
        commits: itemsForPool.filter((i: any) => (contract.commits ?? []).includes(i)),
        credits: itemsForPool.filter((i: any) => (contract.credits ?? []).includes(i)),
      });

      // ISO start of the current billing period = the EARLIEST access_schedule start
      // among active commits. Using the earliest (not [0]) ensures a mid-period credit
      // purchase doesn't shift the breakdowns window forward and under-count earlier usage.
      const pickEarliestStart = (items: any[]): string | null =>
        items.reduce((earliest: string | null, item: any) => {
          const s: string | undefined = item.access_schedule?.schedule_items?.[0]?.starting_at;
          if (!s) return earliest;
          return !earliest || s < earliest ? s : earliest;
        }, null);
      const currentPeriodStart: string | null =
        pickEarliestStart(activeCommits) ??
        pickEarliestStart(activeCredits) ??
        null;

      // Compute available = poolCap − current-period usage from invoice-breakdowns.
      // The raw Metronome commit `balance` field is unreliable when invoice_schedule
      // items interact with the access balance (e.g. the period-commit shows ~$3 remaining
      // instead of ~$14). Using breakdowns matches the pacing chart and usage page.
      let totalAvailable: number;
      try {
        const periodStartDate = currentPeriodStart
          ? new Date(currentPeriodStart)
          : new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate  = new Date(now.getFullYear(), now.getMonth() + 1, 1); // first day of next month
        const startingOn   = periodStartDate.toISOString().slice(0, 10) + 'T00:00:00Z';
        const endingBefore = endDate.toISOString().slice(0, 10) + 'T00:00:00Z';

        const bdRes = await fetchClient.get(
          `/api/metronome/customer/${metronomeCustomerId}/invoice-breakdowns`,
          { params: { starting_on: startingOn, ending_before: endingBefore, window_size: 'day' } },
        );
        const usedCents: number = (bdRes.data?.data ?? [])
          .flatMap((bd: any) => bd.line_items ?? [])
          .filter((li: any) => li.type === 'usage')
          .reduce((s: number, li: any) => s + (Number(li.total) || 0), 0);

        totalAvailable = poolCap > 0 ? Math.max(0, poolCap - usedCents) : normalizeMetronomeSpendableSumCents(rawBalanceSum, scheduleSum, poolCap);
      } catch {
        // Fallback to raw balance if breakdowns fetch fails.
        totalAvailable = normalizeMetronomeSpendableSumCents(rawBalanceSum, scheduleSum, poolCap);
      }

      const balanceScale =
        rawBalanceSum > 0 ? totalAvailable / rawBalanceSum : 1;

      // Commits only — used for the pacing chart; active period only.
      const commitTotal = activeCommits.length > 0
        ? activeCommits.reduce((sum: number, item: any) => {
            const scheduleItems = item.access_schedule?.schedule_items ?? [];
            const scheduled = scheduleItems.reduce((s: number, si: any) => s + (si.amount ?? 0), 0);
            const bal = item.balance ?? 0;
            return sum + (scheduled || Math.round(bal * balanceScale));
          }, 0)
        : (contract.commits ?? []).reduce((sum: number, item: any) => {
            const scheduleItems = item.access_schedule?.schedule_items ?? [];
            const scheduled = scheduleItems.reduce((s: number, si: any) => s + (si.amount ?? 0), 0);
            const bal = item.balance ?? 0;
            return sum + (scheduled || Math.round(bal * balanceScale));
          }, 0);

      const creditItems: MetronomeCreditItem[] = allItems.map((item: any) => {
        const scheduleItems = item.access_schedule?.schedule_items ?? [];
        const scheduledTotal = scheduleItems.reduce(
          (s: number, si: any) => s + (si.amount ?? 0),
          0,
        );
        const available = Math.round((item.balance ?? 0) * balanceScale);
        const total = scheduledTotal > 0 ? scheduledTotal : available;
        return {
          name: item.name ?? item.product?.name ?? 'Credit',
          available,
          total,
        };
      });

      const thresholdConfig = contract.prepaid_balance_threshold_configuration;
      const autoTopUp = thresholdConfig?.is_enabled
        ? {
            thresholdCents: thresholdConfig.threshold_amount,
            rechargeToAmountCents: thresholdConfig.recharge_to_amount,
          }
        : undefined;

      updateState({
        metronomeContract: {
          id: contract.id,
          name: contract.name ?? null,
          startingAt: contract.starting_at ?? null,
          creditTypeId: resolveCreditTypeIdFromContract(contract),
          creditTypeName: resolveCreditTypeNameFromContract(contract),
          creditBalance: {
            totalAvailable,
            totalAmount: poolCap + topUpTotalCents,
          },
          commitTotal,
          currentPeriodStart,
          creditItems,
          autoTopUp,
        },
        metronomeContractLoaded: true,
      });
    } catch (err) {
      console.error('Failed to fetch Metronome contracts:', err);
      updateState({ metronomeContractLoaded: true });
    }
  }, [state.customer?.id, state.customer?.metronomeCustomerId, updateState]);

  useEffect(() => {
    const metronomeCustomerId = getEffectiveMetronomeCustomerId(state.customer);
    if (!metronomeCustomerId) {
      updateState({ metronomeContract: null, metronomeContractLoaded: false });
      return;
    }

    fetchMetronomeContracts();
    // Metronome is the reconciliation source, not the per-request entitlement path.
    // Keep background reads infrequent; generation explicitly refreshes after an
    // accepted ingest batch and billing actions refresh at their own boundaries.
    const interval = setInterval(fetchMetronomeContracts, 60_000);
    return () => clearInterval(interval);
  }, [state.customer?.id, state.customer?.metronomeCustomerId]);

  const reconciliationVersions = useRef<Record<string, number>>({});
  const reconciliationCustomerId = getEffectiveMetronomeCustomerId(
    state.customer,
  );
  useEffect(() => {
    const metronomeCustomerId = reconciliationCustomerId;
    if (!metronomeCustomerId) return;

    const checkReconciliationSignal = async () => {
      try {
        const { data } = await fetchClient.get('/api/metronome/reconciliation', {
          params: { customer_id: metronomeCustomerId },
        });
        const version = Number(data?.signal?.version ?? 0);
        const previous = reconciliationVersions.current[metronomeCustomerId];
        reconciliationVersions.current[metronomeCustomerId] = version;
        if (previous != null && version > previous) {
          await fetchMetronomeContracts();
        }
      } catch (error) {
        console.warn('Failed to check Metronome reconciliation signal:', error);
      }
    };

    void checkReconciliationSignal();
    const handleFocus = () => void checkReconciliationSignal();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkReconciliationSignal();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [reconciliationCustomerId, fetchMetronomeContracts]);

  // Auto-populate metronomeDeliveryMethodId from the Metronome account when the API
  // key is present but the delivery method hasn't been configured yet.
  useEffect(() => {
    const apiKey = (state.settings as any)?.metronomeApiKey?.trim();
    const existing = (state.settings as any)?.metronomeDeliveryMethodId?.trim();

    console.log('[delivery-method] effect triggered — apiKey:', apiKey ? `${apiKey.slice(0, 8)}…` : 'none', '| existing:', existing || 'none');

    if (!apiKey) {
      console.log('[delivery-method] no Metronome API key — skipping lookup');
      return;
    }
    if (existing) {
      console.log('[delivery-method] already set, no fetch needed');
      return;
    }

    console.log('[delivery-method] fetching billing providers from Metronome…');
    fetch('/api/metronome/billing-providers', {
      headers: {
        'demo-metronomeapikey': apiKey,
        'Content-Type': 'application/json',
      },
    })
      .then((r) => {
        console.log('[delivery-method] billing-providers response status:', r.status);
        return r.ok ? r.json() : r.text().then((t) => { throw new Error(`${r.status}: ${t}`); });
      })
      .then((data) => {
        console.log('[delivery-method] providers returned:', JSON.stringify(data?.data ?? []));
        const stripeProvider = (data?.data ?? []).find(
          (p: any) => p.billing_provider === 'stripe' && p.delivery_method_id,
        );
        if (stripeProvider?.delivery_method_id) {
          console.log('[delivery-method] ✅ found delivery method:', stripeProvider.delivery_method_id);
          updateState({
            settings: {
              ...state.settings,
              metronomeDeliveryMethodId: stripeProvider.delivery_method_id,
            } as Settings,
          });
        } else {
          console.warn('[delivery-method] ⚠️ no Stripe provider with delivery_method_id found in response');
        }
      })
      .catch((err) => {
        console.error('[delivery-method] ❌ fetch failed:', err);
      });
  }, [(state.settings as any)?.metronomeApiKey]);

  const updateSetting = useCallback(
    (key: string, value: any) => {
      updateState({
        settings: { ...state.settings, [key]: value } as Settings,
      });

      // Track setting changes
      if (key === 'stripeSecretKey') {
        if (value?.startsWith('sk_')) {
          debounceTrack('setting_changed', {
            setting_type: 'stripe_keys',
            stripe_keys_change_value: 'custom',
          });
        }
      } else {
        debounceTrack('setting_changed', {
          setting_type: key,
          [`${key}_change_value`]: value,
        });
      }

      if (key === 'language' && supportedLanguages.includes(value)) {
        i18n.changeLanguage(value);
        window.history.pushState({}, '', `/${value}`);
      }
    },
    [state.settings, updateState],
  );

  const updateCustomer = useCallback(
    (newCustomer: Partial<Customer>) => {
      const merged = { ...state.customer, ...newCustomer } as Customer;
      if (merged.id && !merged.metronomeCustomerId?.trim()) {
        merged.metronomeCustomerId = DEFAULT_METRONOME_CUSTOMER_ID;
      }
      updateState({
        customer: merged,
      });
    },
    [state.customer, updateState],
  );

  const updatePlan = useCallback(
    (newPlan: Partial<Plan>) => {
      updateState({
        plan: { ...state.plan, ...newPlan } as Plan,
      });
    },
    [state, updateState],
  );

  const updateSubscription = useCallback(
    (newSubscription: Partial<Subscription>) => {
      updateState({
        subscription: {
          ...state.subscription,
          ...newSubscription,
        } as Subscription,
      });
    },
    [state, updateState],
  );

  const triggerElementsRefresh = useCallback(() => {
    setState((prevState) => ({
      ...prevState,
      refreshElements: prevState.refreshElements + 1,
    }));
  }, []);

  const triggerSubscriptionRefresh = useCallback(async () => {
    await fetchPlanAndSubscription();
  }, [fetchPlanAndSubscription]);

  const triggerMetronomeContractRefresh = useCallback(async () => {
    await fetchMetronomeContracts();
  }, [fetchMetronomeContracts]);

  const contextValue = useMemo(
    () => ({
      ...state,
      demoMode,
      updateDemoMode,
      updateSetting,
      updateCustomer,
      updatePlan,
      updateSubscription,
      updateState,
      triggerElementsRefresh,
      triggerSubscriptionRefresh,
      triggerMetronomeContractRefresh,
      toggleToolsPanel: (panelName: string) =>
        setState((state) => {
          const newState = toggleToolsPanel(state, panelName);
          // @ts-expect-error umami exposed at load
          if (newState[panelName] === true) {
            debounceTrack('tools_panel_opened');
          }
          return newState;
        }),
      resetSettings,
    }),
    [
      state,
      demoMode,
      updateDemoMode,
      updateSetting,
      updateCustomer,
      updatePlan,
      updateSubscription,
      updateState,
      triggerElementsRefresh,
      triggerSubscriptionRefresh,
      triggerMetronomeContractRefresh,
      resetSettings,
    ],
  );

  if (state.isLoading) return <LoadingOverlay />;

  return (
    <ConfigContext.Provider value={contextValue}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfigContext(): ConfigContextType {
  const context = useContext(ConfigContext);

  if (!context) {
    throw new Error('useConfigContext must be used within a ConfigProvider');
  }

  return context;
}
