import Spinner from './Spinner';
import { cn } from '@/lib/utils';

export default function Button({
  text,
  onClick,
  isLoading = false,
  disabled = false,
  className = '',
  icon,
}: {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-center rounded-md bg-secondary px-4 h-11 text-base font-bold text-foreground shadow-sm hover:bg-purple-hover focus:outline-none focus:ring-2 focus:ring-purple focus:ring-offset-2 focus:ring-offset-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out',
        className,
      )}
    >
      {isLoading ? (
        <Spinner />
      ) : (
        <>
          {text}
          {icon && <span className='ml-2'>{icon}</span>}
        </>
      )}
    </button>
  );
}
