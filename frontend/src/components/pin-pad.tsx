'use client';

import { useEffect, useState } from 'react';
import { Delete, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PinDots({ length, filled }: { length: number; filled: number }) {
  return (
    <div className="flex items-center justify-center gap-3">
      {Array.from({ length }).map((_, index) => (
        <span
          key={index}
          className={cn(
            'h-3 w-3 rounded-full border-2 transition-all duration-200',
            index < filled
              ? 'scale-110 border-brand-500 bg-brand-500'
              : 'border-line bg-transparent'
          )}
        />
      ))}
    </div>
  );
}

export function PinPad({
  onComplete,
  busy = false,
  keyReset = 0,
  length = 4
}: {
  onComplete: (pin: string) => void;
  busy?: boolean;
  keyReset?: number;
  length?: number;
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue('');
  }, [keyReset]);

  useEffect(() => {
    if (value.length === length) {
      const timer = setTimeout(() => onComplete(value), 120);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [value, length, onComplete]);

  const press = (digit: string) => {
    if (busy || value.length >= length) return;
    setValue((current) => `${current}${digit}`);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        <PinDots length={length} filled={value.length} />
        {busy && (
          <span className="absolute -right-7 top-1/2 -translate-y-1/2 text-brand-500">
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
        )}
      </div>
      <div className="grid w-full max-w-[260px] grid-cols-3 gap-2.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => press(digit)}
            className="h-14 rounded-2xl border border-line bg-white text-xl font-semibold text-ink transition active:scale-95 hover:border-brand-300 hover:bg-brand-50"
          >
            {digit}
          </button>
        ))}
        <span />
        <button
          type="button"
          onClick={() => press('0')}
          className="h-14 rounded-2xl border border-line bg-white text-xl font-semibold text-ink transition active:scale-95 hover:border-brand-300 hover:bg-brand-50"
        >
          0
        </button>
        <button
          type="button"
          onClick={() => setValue((current) => current.slice(0, -1))}
          className="flex h-14 items-center justify-center rounded-2xl text-muted transition active:scale-95 hover:bg-cream hover:text-ink"
          aria-label="Delete digit"
        >
          <Delete size={20} />
        </button>
      </div>
    </div>
  );
}
