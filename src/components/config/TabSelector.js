import {
  Cog6ToothIcon,
  KeyIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

const TabSelector = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { name: 'Demo', href: '#', icon: SparklesIcon },
    { name: 'Appearance', href: '#', icon: Cog6ToothIcon },
    { name: 'Account', href: '#', icon: KeyIcon },
  ];

  return (
    <div className='block mb-4'>
      <div className='border-b border-gray-200'>
        <nav aria-label='Tabs' className='-mb-px flex space-x-2'>
          {tabs.map((tab) => (
            <a
              key={tab.name}
              href={tab.href}
              onClick={() => setActiveTab(tab.name)}
              aria-current={activeTab === tab.name ? 'page' : undefined}
              className={`
                    ${
                      activeTab === tab.name
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    } 
                    group inline-flex items-center border-b-2 px-1 py-4 text-sm font-medium`}
            >
              <tab.icon
                title={tab.name}
                aria-hidden='true'
                className={`
                      ${
                        activeTab === tab.name
                          ? 'text-indigo-500'
                          : 'text-gray-400 group-hover:text-gray-500'
                      } 
                      '-ml-0.5 h-5 w-5',
                    `}
              />
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default TabSelector;
