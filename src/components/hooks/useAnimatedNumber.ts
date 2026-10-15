'use client';

import { useEffect, useRef, useState } from 'react';

export default function useAnimatedNumber(
  target: number,
  durationMs = 700,
  initialValue = target,
  enabled = true,
  fractionDigits = 0,
): number {
  const [displayed, setDisplayed] = useState(initialValue);
  const displayedRef = useRef(initialValue);

  useEffect(() => {
    if (!enabled) return;

    const from = displayedRef.current;
    if (from === target) return;

    let frameId = 0;
    const startedAt = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const factor = 10 ** Math.max(0, fractionDigits);
      const next =
        Math.round((from + (target - from) * eased) * factor) / factor;
      displayedRef.current = next;
      setDisplayed(next);
      if (progress < 1) frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [durationMs, enabled, fractionDigits, target]);

  return displayed;
}
