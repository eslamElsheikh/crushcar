'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'dark' | 'ghost';
type Size = 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'v2-btn-primary',
  dark: 'v2-btn-dark',
  ghost: 'v2-btn-ghost',
};

const sizes: Record<Size, string> = {
  md: 'min-h-[52px] px-6 py-3 text-[15px]',
  lg: 'min-h-[52px] lg:min-h-[60px] px-7 py-3.5 text-[15px]',
};

export interface V2ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const V2Button = forwardRef<HTMLButtonElement, V2ButtonProps>(
  ({ variant = 'primary', size = 'md', className, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2',
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    />
  )
);
V2Button.displayName = 'V2Button';
