'use client';

import React, { useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';

const ContactUsPage = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { updateCustomer } = useConfigContext();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [message, setMessage] = useState('');
  const [processing, setProcessing] = useState<boolean>(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProcessing(true);

    const { data } = await fetchClient.post('/api/auth/sign-up', {
      email,
      companyName,
      message,
      firstName,
      lastName,
    });

    setProcessing(false);

    // Open customer dashboard
    updateCustomer({ id: data.customerId, email });
    router.push('settings');

    // Open Stripe dashboard with customer
    window.open(
      `https://dashboard.stripe.com/test/customers/${data.customerId}?create=subscription&subscription_default_customer=${data.customerId}`,
      '_newtab',
    );
  };

  return (
    <div className='min-h-screen bg-background flex flex-col items-center pt-8'>
      <div className='max-w-7xl w-full space-y-8 p-8'>
        <div className='flex flex-col md:flex-row gap-8 justify-between'>
          <div className='md:w-1/3'>
            <h1 className='text-4xl font-bold mb-4 text-text-color'>
              {t('contact_us.contact')}
            </h1>
            <p className='text-text-color'>{t('contact_us.connect')}</p>
          </div>
          <div className='md:w-1/2 bg-gray-300 rounded-lg'>
            <div className='bg-purple-200 p-8'>
              <form className='space-y-6' onSubmit={handleSubmit}>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                  <div>
                    <label
                      htmlFor='firstName'
                      className='block text-sm font-medium text-gray-700 mb-1'
                    >
                      {t('contact_us.first_name')}
                    </label>
                    <input
                      id='firstName'
                      name='firstName'
                      type='text'
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className='w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500'
                    />
                  </div>
                  <div>
                    <label
                      htmlFor='lastName'
                      className='block text-sm font-medium text-gray-700 mb-1'
                    >
                      {t('contact_us.last_name')}
                    </label>
                    <input
                      id='lastName'
                      name='lastName'
                      type='text'
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className='w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500'
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor='email'
                    className='block text-sm font-medium text-gray-700 mb-1'
                  >
                    {t('contact_us.email')}
                  </label>
                  <input
                    id='email'
                    name='email'
                    type='email'
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className='w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500'
                  />
                </div>
                <div>
                  <label
                    htmlFor='companyName'
                    className='block text-sm font-medium text-gray-700 mb-1'
                  >
                    {t('contact_us.company_name')}
                  </label>
                  <input
                    id='companyName'
                    name='companyName'
                    type='text'
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className='w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500'
                  />
                </div>
                <div>
                  <label
                    htmlFor='message'
                    className='block text-sm font-medium text-gray-700 mb-1'
                  >
                    {t('contact_us.why')}
                  </label>
                  <textarea
                    id='message'
                    name='message'
                    rows={4}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className='w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500'
                  />
                </div>
                <div>
                  <button
                    type='submit'
                    disabled={processing}
                    className='w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-button-color bg-purple hover:bg-purple-hover focus:outline-none'
                  >
                    {!processing
                      ? t('contact_us.submit')
                      : t('contact_us.loading')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactUsPage;
