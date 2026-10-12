import { headers } from 'next/headers';
import SignUpForm from '@/components/auth/SignUpForm';

export default async function SignUp() {
  const headersList = await headers();
  // Vercel sets x-vercel-ip-country; Cloudflare sets cf-ipcountry
  const country =
    headersList.get('x-vercel-ip-country') ||
    headersList.get('cf-ipcountry') ||
    'US';

  return (
    <div className='grid items-center'>
      <SignUpForm defaultCountry={country.toUpperCase()} />
    </div>
  );
}
