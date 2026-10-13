import { defaultDemoSettings } from '@/config/config';
import { getEnv } from '@/config/customizationConfig';
import { useCart } from '@/contexts/CartContext';
import { useConfigContext } from '@/contexts/ConfigContext';
import { inspectedFetch } from '@/utils/inspectedFetch';
import { useEffect, useState } from 'react';

const AccountTab = () => {
  const { settings, updateSetting } = useConfigContext();
  const { clearCart } = useCart();
  const [defaultPk, setDefaultPk] = useState('');
  const [billingProviders, setBillingProviders] = useState(null);
  const [loadingProviders, setLoadingProviders] = useState(false);

  useEffect(() => {
    getEnv().then((env) => {
      setDefaultPk(env.stripePublishableKey || settings.stripePublishableKey);
    });
  }, [settings]);

  const metronomeKey = settings.metronomeApiKey;
  const hasCustomMetronomeKey =
    metronomeKey &&
    metronomeKey !== defaultDemoSettings.metronomeApiKey;

  useEffect(() => {
    if (!hasCustomMetronomeKey) {
      setBillingProviders(null);
      return;
    }

    setLoadingProviders(true);
    inspectedFetch('/api/metronome/billing-providers', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'demo-metronomeapikey': metronomeKey,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        const providers = data?.data ?? [];
        setBillingProviders(providers);
        if (providers.length === 1 && !settings.metronomeDeliveryMethodId) {
          updateSetting('metronomeDeliveryMethodId', providers[0].delivery_method_id);
        }
      })
      .catch(() => setBillingProviders([]))
      .finally(() => setLoadingProviders(false));
  }, [hasCustomMetronomeKey, metronomeKey]);

  return (
    <div className='space-y-4'>
      {[
        { label: 'Stripe Publishable Key', key: 'stripePublishableKey' },
        { label: 'Stripe Secret Key', key: 'stripeSecretKey' },
        { label: 'Metronome API Key', key: 'metronomeApiKey' },
      ].map(({ label, key }) => (
        <div key={key}>
          <label className='block mb-2 text-sm font-medium text-gray-700'>
            {label}
          </label>
          <input
            type='text'
            value={
              settings[key] !== defaultDemoSettings[key] &&
              settings[key] !== defaultPk
                ? settings[key]
                : ''
            }
            onChange={(e) => {
              updateSetting(key, e.target.value);
              clearCart();
            }}
            placeholder='Enter to override .env value'
            className='w-full p-2 border border-gray-300 rounded-md text-gray-700 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
          />
        </div>
      ))}

      {hasCustomMetronomeKey && (
        <div>
          <label className='block mb-2 text-sm font-medium text-gray-700'>
            Billing Provider
          </label>
          {loadingProviders ? (
            <p className='text-xs text-gray-500'>Loading billing providers...</p>
          ) : billingProviders && billingProviders.length > 0 ? (
            <div className='space-y-2'>
              {billingProviders.map((provider) => (
                <button
                  key={provider.delivery_method_id}
                  onClick={() => {
                    updateSetting('metronomeDeliveryMethodId', provider.delivery_method_id);
                    clearCart();
                  }}
                  className={`w-full text-left p-2 rounded-md border text-sm transition-colors ${
                    settings.metronomeDeliveryMethodId === provider.delivery_method_id
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <span className='font-medium capitalize'>{provider.billing_provider}</span>
                  {provider.delivery_method_configuration?.stripe_account_id && (
                    <span className='ml-1 text-xs text-gray-500'>
                      ({provider.delivery_method_configuration.stripe_account_id})
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : billingProviders && billingProviders.length === 0 ? (
            <p className='text-xs text-gray-500'>No billing providers configured in this Metronome account.</p>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default AccountTab;
