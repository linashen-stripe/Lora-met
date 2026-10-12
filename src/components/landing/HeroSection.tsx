'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useConfigContext } from '@/contexts/ConfigContext';
import { useTranslation } from 'react-i18next';

const useTypewriter = ({
  texts,
  typingSpeed = 100,
  deletingSpeed = 50,
  pauseDuration = 2000,
}: {
  texts: string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
}) => {
  const [currentText, setCurrentText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const textIndexRef = useRef(0);
  const charIndexRef = useRef(0);

  useEffect(() => {
    const handleTyping = () => {
      const currentFullText = texts[textIndexRef.current];
      if (isDeleting) {
        if (charIndexRef.current > 0) {
          setCurrentText(
            currentFullText.substring(0, charIndexRef.current - 1),
          );
          charIndexRef.current--;
        } else {
          setIsDeleting(false);
          textIndexRef.current = (textIndexRef.current + 1) % texts.length;
        }
      } else {
        if (charIndexRef.current < currentFullText.length) {
          setCurrentText(
            currentFullText.substring(0, charIndexRef.current + 1),
          );
          charIndexRef.current++;
        } else {
          setTimeout(() => setIsDeleting(true), pauseDuration);
        }
      }
    };

    const timer = setTimeout(
      handleTyping,
      isDeleting ? deletingSpeed : typingSpeed,
    );
    return () => clearTimeout(timer);
  }, [
    currentText,
    isDeleting,
    texts,
    typingSpeed,
    deletingSpeed,
    pauseDuration,
  ]);

  return currentText;
};

// Section wrapper component
const Section = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <section className={`py-16 ${className}`}>
    <div className='container mx-auto px-6'>{children}</div>
  </section>
);

function HeroSection() {
  const { settings, customer } = useConfigContext();
  const router = useRouter();
  const { t } = useTranslation();
  const typedText = useTypewriter({
    texts: [
      t('header.hero.typewriter.text1'),
      t('header.hero.typewriter.text2'),
      t('header.hero.typewriter.text3'),
      t('header.hero.typewriter.text4'),
    ],
  });

  const language = settings?.language || 'en';
  const isLoggedIn = Boolean(customer?.id);

  const handleGetStarted = () => {
    if (isLoggedIn) {
      router.push(`/${language}/chat`);
      return;
    }

    router.push(`/${language}/pricing`);
  };

  return (
    <div className='relative text-center'>
      {/* Background grid pattern */}
      <div className='absolute inset-0 bg-grid-pattern opacity-5'></div>

      <Section className='pt-20'>
        <h1 className='bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-7xl'>
          {t('landing.hero.main_title')}
        </h1>
        <p className='mx-auto mt-6 max-w-2xl text-xl text-muted-foreground'>
          {t('landing.hero.description')}
        </p>

        {/* Typing indicator */}
        <div className='mx-auto mt-10 max-w-6xl'>
          <div className='relative flex min-h-[4rem] items-center rounded-xl border border-border bg-card p-6 font-mono text-left text-lg shadow-lg'>
            <span className='text-purple'>~ $</span>
            <span className='ml-2 text-foreground'>
              {t('landing.hero.build_command')}&nbsp;
            </span>
            <span className='font-medium text-purple'>{typedText}</span>
            <span className='animate-pulse text-purple'>|</span>
          </div>
        </div>

        {/* Call to action button */}
        <div className='mt-10 flex flex-col items-center relative z-10'>
          {/* Using a standard button element to ensure functionality */}
          <button
            type='button'
            onClick={handleGetStarted}
            className='rounded-lg bg-purple hover:bg-purple-hover px-8 py-2 text-lg font-semibold text-primary-foreground shadow-lg transition-all duration-200 hover:scale-105 relative z-20'
          >
            {isLoggedIn
                ? t('landing.hero.button_logged_in')
                : t('landing.hero.button_not_logged_in')}
          </button>
          {!isLoggedIn && (
            <p className='mt-4 text-xs text-muted-foreground'>
              {t('landing.hero.no_credit_card')}
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}

export default HeroSection;
