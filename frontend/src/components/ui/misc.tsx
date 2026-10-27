import * as React from 'react';
import { cn } from '@/lib/utils';
import { Loader2, PackageOpen } from 'lucide-react';
import { Button } from './button';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-line/60', className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 rounded-2xl bg-cream p-3 text-brand-500">
        {icon ?? <PackageOpen size={24} />}
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-line', className)} />;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600">
            {eyebrow}
          </p>
        )}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ConfirmButton({
  onConfirm,
  children,
  className,
  variant = 'danger'
}: {
  onConfirm: () => void;
  children: React.ReactNode;
  className?: string;
  variant?: 'danger' | 'outline' | 'soft';
}) {
  const [pending, setPending] = React.useState(false);
  return (
    <Button
      variant={variant}
      size="sm"
      className={className}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await Promise.resolve(onConfirm());
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? <Spinner /> : children}
    </Button>
  );
}
