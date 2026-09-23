'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ label, hint, id, className = '', ...rest }, ref) {
    const inputId = id ?? rest.name;
    return (
      <label
        htmlFor={inputId}
        className="flex cursor-pointer items-start gap-2.5 rounded-md border bg-background p-3 hover:bg-muted/40"
      >
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className={`mt-0.5 h-4 w-4 rounded border-muted-foreground/40 text-primary focus:ring-primary ${className}`}
          {...rest}
        />
        <span className="flex-1">
          <span className="block text-sm font-medium">{label}</span>
          {hint && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {hint}
            </span>
          )}
        </span>
      </label>
    );
  }
);