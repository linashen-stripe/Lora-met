import { InformationCircleIcon } from '@heroicons/react/24/outline';

export default function CurrencyInfoTooltip() {
  return (
    <>
      <div className='group flex relative items-center'>
        <InformationCircleIcon className='h-4 w-4 text-gray-500 hover:text-gray-700 cursor-default' />
        <span className='max-w-[12rem] text-xs text-wrap invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white text-gray-900 border border-gray-200 rounded-md absolute bottom-full left-1/2 -translate-x-1/2 mb-2 py-1 px-2 shadow'>
          You cannot change currency when you have a subscription
        </span>
      </div>
    </>
  );
}
