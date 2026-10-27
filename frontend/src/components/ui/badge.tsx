import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold',
  {
    variants: {
      variant: {
        default: 'bg-cream text-muted',
        brand: 'bg-brand-50 text-brand-700',
        success: 'bg-[#eef4ec] text-moss',
        warning: 'bg-[#fdf3dd] text-[#9a7020]',
        danger: 'bg-[#fbecef] text-berry',
        info: 'bg-[#edf3f7] text-sky',
        ink: 'bg-ink text-white'
      }
    },
    defaultVariants: { variant: 'default' }
  }
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
