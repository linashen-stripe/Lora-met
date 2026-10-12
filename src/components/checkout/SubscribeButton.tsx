import { useTranslation } from 'react-i18next';

interface Props {
  onClick: () => void;
  disabled: boolean;
}

const SubscribeButton = ({ onClick, disabled = false }: Props) => {
  const { t } = useTranslation();

  return (
    <button
      className='w-full bg-accent text-accent-foreground my-2 py-2 px-4 rounded-md hover:bg-purple-hover disabled:opacity-50 transition duration-300'
      disabled={disabled}
      onClick={onClick}
    >
      {!disabled ? t('subscription_pro.subscribe') : t('return.please_wait')}
    </button>
  );
};

export default SubscribeButton;
