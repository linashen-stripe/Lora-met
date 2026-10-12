import { useCallback, useRef, useState } from 'react';

/** Shared state/behavior for a terminal-style output panel: lines + auto-scroll. */
export function useTerminalLines() {
  const [lines, setLines] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = outputRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  const appendLine = useCallback(
    (line: string) => {
      setLines((prev) => [...prev, line]);
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const appendLines = useCallback(
    (newLines: string[]) => {
      setLines((prev) => [...prev, ...newLines]);
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const reset = useCallback((initial: string[] = []) => {
    setLines(initial);
  }, []);

  return { lines, outputRef, appendLine, appendLines, reset };
}
