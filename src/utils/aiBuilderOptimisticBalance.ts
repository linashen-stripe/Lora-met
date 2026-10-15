export const AI_BUILDER_CHAT_STORAGE_KEY = 'lora-demo:ai-builder:chat';

export type AiBuilderOptimisticBalance = {
  balanceContractId?: string;
  availableBalanceCents?: number;
  pendingSpendCents?: number;
  pendingSpendAt?: string;
};

export function getAiBuilderChatStorageKey(customerId?: string) {
  return `${AI_BUILDER_CHAT_STORAGE_KEY}:${customerId ?? 'guest'}`;
}

export function readAiBuilderOptimisticBalance(
  customerId?: string,
): AiBuilderOptimisticBalance | null {
  if (typeof window === 'undefined' || !customerId) return null;
  try {
    const raw = localStorage.getItem(getAiBuilderChatStorageKey(customerId));
    return raw ? (JSON.parse(raw) as AiBuilderOptimisticBalance) : null;
  } catch {
    return null;
  }
}
