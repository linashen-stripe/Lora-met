import Metronome from '@metronome/sdk';

const USD_CREDIT_TYPE_ID = '2714e483-4ff1-48e4-9e25-ac732e8f24f2';

export async function configureContractAutoTopUp(params: {
  metronome: Metronome;
  customerId: string;
  contractId: string;
  thresholdAmount: number;
  rechargeToAmount: number;
  name?: string;
}) {
  const retrieved = await params.metronome.v2.contracts.retrieve({
    customer_id: params.customerId,
    contract_id: params.contractId,
    include_balance: true,
  });
  const contract = retrieved.data as any;
  if (contract.prepaid_balance_threshold_configuration?.is_enabled) {
    return { contractId: params.contractId, alreadyConfigured: true };
  }
  const existingCommit =
    (contract.commits ?? [])[0] ?? (contract.credits ?? [])[0];
  if (!existingCommit) {
    throw new Error('No commit or credit found on contract for auto top-up.');
  }
  const productId =
    existingCommit.product?.id ?? existingCommit.product_id;
  const creditTypeId =
    existingCommit.access_schedule?.credit_type?.id ??
    existingCommit.credit_type?.id;
  if (!productId) {
    throw new Error('Could not resolve the auto top-up product.');
  }
  const existingThresholdConfiguration =
    contract.prepaid_balance_threshold_configuration;
  const thresholdConfiguration = {
    is_enabled: true,
    threshold_amount: params.thresholdAmount,
    recharge_to_amount: params.rechargeToAmount,
  };
  await (params.metronome.v2.contracts as any).edit({
    customer_id: params.customerId,
    contract_id: params.contractId,
    ...(existingThresholdConfiguration
      ? {
          update_prepaid_balance_threshold_configuration:
            thresholdConfiguration,
        }
      : {
          add_prepaid_balance_threshold_configuration: {
            ...thresholdConfiguration,
            ...(creditTypeId && creditTypeId !== USD_CREDIT_TYPE_ID
              ? { custom_credit_type_id: creditTypeId }
              : {}),
            payment_gate_config: {
              payment_gate_type: 'STRIPE',
              stripe_config: { payment_type: 'INVOICE' },
            },
            commit: {
              product_id: productId,
              name: params.name ?? 'Auto Top-Up',
            },
          },
        }),
  });
  return { contractId: params.contractId, alreadyConfigured: false };
}

