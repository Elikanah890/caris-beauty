import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:pointer-events-none disabled:opacity-50 active:scale-[.985]',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-500 text-white shadow-[0_10px_24px_-12px_rgba(249,115,22,.9)] hover:bg-brand-600',
        secondary: 'bg-ink text-white hover:bg-[#35291f]',
        outline: 'border border-line bg-white text-ink hover:border-brand-300 hover:bg-brand-50',
        ghost: 'text-ink hover:bg-brand-50',
        soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
        danger: 'bg-berry text-white hover:bg-[#9e4258]',
        success: 'bg-moss text-white hover:bg-[#4f6a49]'
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-5 text-[15px]',
        icon: 'h-10 w-10 p-0'
      }
    },
    defaultVariants: { variant: 'primary', size: 'md' }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = 'Button';

export { buttonVariants };
