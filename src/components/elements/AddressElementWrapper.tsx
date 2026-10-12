import { AddressElement } from '@stripe/react-stripe-js';

export default function AddressElementWrapper({ setAddress }: any) {
  return (
    <div id='address-element' className='content-element'>
      <AddressElement options={{ mode: 'billing' }} onChange={setAddress} />
    </div>
  );
}
