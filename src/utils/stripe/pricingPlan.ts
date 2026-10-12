import Stripe from 'stripe';

export async function getExpandedPricingPlanComponents(
  stripe: Stripe,
  pricingPlanId: string,
) {
  const components =
    await stripe.v2.billing.pricingPlans.components.list(pricingPlanId);

  return await Promise.all(
    components.data.map(
      async (component: Stripe.V2.Billing.PricingPlanComponent) => {
        // If the component is a rate card, return the rate card inner details
        if (component.type === 'rate_card' && component.rate_card) {
          const rates = await stripe.v2.billing.rateCards.rates.list(
            component.rate_card.id,
          );
          return {
            ...component,
            expanded_rate_card_rates: rates.data,
          };
        }

        // If the component is a license fee, return the license fee inner details
        if (component.type === 'license_fee' && component.license_fee) {
          const licenseFee = await stripe.v2.billing.licenseFees.retrieve(
            component.license_fee.id,
          );
          return {
            ...component,
            expanded_license_fee: licenseFee,
          };
        }

        if (component.type === 'service_action' && component.service_action) {
          const serviceAction = await stripe.v2.billing.serviceActions.retrieve(
            component.service_action.id,
          );
          return {
            ...component,
            expanded_service_action: serviceAction,
          };
        }

        return component;
      },
    ),
  );
}
