import type { ApiTraceEntry } from '@/utils/apiInspector';
import {
  runStarter as runGenerationStarter,
  type PricingDimension as GenerationPricingDimension,
} from '@/server/metronomeStarter';
import {
  runAiBuilderStarter,
  type AiBuilderPricingDimension,
} from '@/server/aiBuilderStarter';

export type AccountStarterMode = 'ai-builder' | 'generation';
export type AccountStarterAction = 'plan' | 'seed' | 'reset';
export type AccountStarterResetScope = 'demo-data' | 'full';

export type AccountStarterOptions = {
  starterMode: AccountStarterMode;
  action: AccountStarterAction;
  apiKey: string;
  confirmReset?: boolean;
  resetScope?: AccountStarterResetScope;
  resourcePrefix?: string;
  quickstartName?: string;
  proName?: string;
  powerUserName?: string;
  stripeSecretKey?: string;
  deliveryMethodId?: string;
  pricingDimension?:
    | GenerationPricingDimension
    | AiBuilderPricingDimension
    | null;
  onLog?: (line: string) => void;
  onTrace?: (entry: ApiTraceEntry) => void;
};

/**
 * Keeps the two billing models behind one UI/API contract without sharing
 * catalog, credit, contract, or reset semantics between them.
 */
export async function runAccountStarter(options: AccountStarterOptions) {
  if (options.starterMode === 'ai-builder') {
    return runAiBuilderStarter({
      apiKey: options.apiKey,
      mode: options.action,
      confirmReset: options.confirmReset,
      resetScope: options.resetScope,
      pricingDimension:
        (options.pricingDimension as AiBuilderPricingDimension | null) ?? null,
      resourcePrefix: options.resourcePrefix,
      quickstartName: options.quickstartName,
      proName: options.proName,
      powerUserName: options.powerUserName,
      stripeSecretKey: options.stripeSecretKey,
      deliveryMethodId: options.deliveryMethodId,
      onLog: options.onLog,
      onTrace: options.onTrace,
    });
  }

  return runGenerationStarter({
    apiKey: options.apiKey,
    mode: options.action,
    confirmReset: options.confirmReset,
    resetScope: options.resetScope,
    pricingDimension:
      (options.pricingDimension as GenerationPricingDimension | null) ?? null,
    resourcePrefix: options.resourcePrefix,
    quickstartName: options.quickstartName,
    proName: options.proName,
    powerUserName: options.powerUserName,
    stripeSecretKey: options.stripeSecretKey,
    deliveryMethodId: options.deliveryMethodId,
    onLog: options.onLog,
    onTrace: options.onTrace,
  });
}
