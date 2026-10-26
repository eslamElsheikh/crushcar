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

// A type alias, not an empty interface: `interface X extends Y {}` declares
// nothing that `Y` does not already, which is exactly what a type alias says.
export type V2InputProps = InputHTMLAttributes<HTMLInputElement>;

export const V2Input = forwardRef<HTMLInputElement, V2InputProps>(
  ({ className, type = 'text', ...rest }, ref) => (
    <input ref={ref} type={type} className={cn('v2-input', className)} {...rest} />
  )
);
V2Input.displayName = 'V2Input';

export type V2SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const V2Select = forwardRef<HTMLSelectElement, V2SelectProps>(
  ({ className, children, ...rest }, ref) => (
    <select ref={ref} className={cn('v2-input', className)} {...rest}>
      {children}
    </select>
  )
);
V2Select.displayName = 'V2Select';
