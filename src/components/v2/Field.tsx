'use client';

import { InputHTMLAttributes, SelectHTMLAttributes, ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';

/** Label + control + inline error. Errors render next to the action (baseline). */
export function V2Field({
  label,
  error,
  children,
  htmlFor,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="grid gap-2">
      <span className="px-1 text-[13px] font-bold text-[#0B1B33]">{label}</span>
      {children}
      {error && (
        <span role="alert" className="px-1 text-[13px] font-semibold text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

export interface V2InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const V2Input = forwardRef<HTMLInputElement, V2InputProps>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} className={cn('v2-input', className)} {...rest} />
  )
);
V2Input.displayName = 'V2Input';

export interface V2SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export const V2Select = forwardRef<HTMLSelectElement, V2SelectProps>(
  ({ className, children, ...rest }, ref) => (
    <select ref={ref} className={cn('v2-input', className)} {...rest}>
      {children}
    </select>
  )
);
V2Select.displayName = 'V2Select';
