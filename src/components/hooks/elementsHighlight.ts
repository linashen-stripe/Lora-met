'use client';

import { useState, useEffect } from 'react';

const useElementsHighlight = (): boolean => {
  const [isHighlighting, setIsHighlighting] = useState<boolean>(false);

  // Listen to keyboard event Ctrl + H
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 'h') {
        event.preventDefault();
        setIsHighlighting((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyPress);

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  // Add/remove 'reveal-elements' class to identify elements
  useEffect(() => {
    if (isHighlighting) {
      document.body.classList.add('reveal-elements');
    } else {
      document.body.classList.remove('reveal-elements');
    }
  }, [isHighlighting]);

  return isHighlighting;
};

export default useElementsHighlight;
