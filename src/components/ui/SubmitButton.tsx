'use client';

import { type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from './Button';

interface SubmitButtonProps {
  children: ReactNode;
  loadingText?: string;
  className?: string;
}

export function SubmitButton({
  children,
  loadingText = 'Guardando...',
  className,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      loading={pending}
      disabled={pending}
      className={className}
    >
      {pending ? loadingText : children}
    </Button>
  );
}