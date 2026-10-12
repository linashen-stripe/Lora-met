/* eslint-disable i18next/no-literal-string */
import { RefObject } from 'react';

interface TerminalPanelProps {
  lines: string[];
  outputRef: RefObject<HTMLDivElement | null>;
  className?: string;
}

export default function TerminalPanel({ lines, outputRef, className = '' }: TerminalPanelProps) {
  return (
    <div
      ref={outputRef}
      className={`h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-md bg-black p-4 font-mono text-xs leading-relaxed text-green-400 ${className}`}
    >
      {lines.length === 0 ? (
        <span className='text-gray-500'>Output will appear here…</span>
      ) : (
        lines.map((line, i) => <div key={i}>{line || ' '}</div>)
      )}
    </div>
  );
}
