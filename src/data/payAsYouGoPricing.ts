/**
 * PAYG table “provider” column — visual lane only (not sent to Metronome ingest).
 * Aligns with fictional Lora families: Mythic/Spark vs Prime/Echo styling.
 */
export type PaygProvider = 'lora_mythic' | 'lora_prime';

export interface PaygModelRow {
  provider: PaygProvider;
  /** Display name — match Lora SKUs / rate card naming. */
  modelName: string;
  /** USD per million input tokens */
  inputUsdPerMillion: number;
  /** USD per million output tokens */
  outputUsdPerMillion: number;
}

export interface PaygProduct {
  id: string;
  name: string;
  models: PaygModelRow[];
}

/** Standard pay-as-you-go rates (USD per million tokens). */
export const payAsYouGoProducts: PaygProduct[] = [
  {
    id: 'code-assist',
    name: 'Code Assist',
    models: [
      {
        provider: 'lora_mythic',
        modelName: 'Lora Mythic 4.6',
        inputUsdPerMillion: 3.0,
        outputUsdPerMillion: 15.0,
      },
      {
        provider: 'lora_prime',
        modelName: 'Lora Prime Mini 5.4',
        inputUsdPerMillion: 0.75,
        outputUsdPerMillion: 4.5,
      },
    ],
  },
  {
    id: 'chat',
    name: 'Chat',
    models: [
      {
        provider: 'lora_mythic',
        modelName: 'Lora Mythic 4.6',
        inputUsdPerMillion: 3.0,
        outputUsdPerMillion: 15.0,
      },
      {
        provider: 'lora_prime',
        modelName: 'Lora Prime Mini 5.4',
        inputUsdPerMillion: 0.75,
        outputUsdPerMillion: 4.5,
      },
      {
        provider: 'lora_prime',
        modelName: 'Lora Prime 5.4',
        inputUsdPerMillion: 2.5,
        outputUsdPerMillion: 15.0,
      },
    ],
  },
  {
    id: 'voice',
    name: 'Voice',
    models: [
      {
        provider: 'lora_mythic',
        modelName: 'Lora Spark 4.5',
        inputUsdPerMillion: 1.0,
        outputUsdPerMillion: 5.0,
      },
      {
        provider: 'lora_prime',
        modelName: 'Lora Echo 1.5',
        inputUsdPerMillion: 32.0,
        outputUsdPerMillion: 64.0,
      },
    ],
  },
];
