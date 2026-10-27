import { cn } from '@/lib/utils';

export function BrandMark({
  size = 'md',
  className
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl',
        size === 'sm' && 'h-10 w-10',
        size === 'md' && 'h-16 w-16',
        size === 'lg' && 'h-20 w-20',
        className
      )}
    >
      <img src="/images/brand/caris-mark-gold.png" alt="CARIS" className="h-full w-full object-contain drop-shadow-[0_6px_14px_rgba(65,35,42,0.22)]" />
    </span>
  );
}

export function BrandLockup({
  compact = false,
  light = false,
  name = 'Duka',
  tagline
}: {
  compact?: boolean;
  light?: boolean;
  name?: string;
  tagline?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      <div className="leading-tight">
        <p
          className={cn(
            'font-display text-lg font-semibold tracking-tight',
            light ? 'text-white' : 'text-ink'
          )}
        >
          {name}
        </p>
        {!compact && tagline && (
          <p
            className={cn(
              'text-[10px] font-medium uppercase tracking-[0.16em]',
              light ? 'text-white/45' : 'text-muted'
            )}
          >
            {tagline}
          </p>
        )}
      </div>
    </div>
  );
}
