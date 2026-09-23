'use client';

import { forwardRef, useMemo, useState, type InputHTMLAttributes } from 'react';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  error?: string;
  label?: string;
  hint?: string;
  showStrength?: boolean;
}

interface StrengthResult {
  score: number;
  label: string;
  color: string;
  barColor: string;
  checks: {
    minLength: boolean;
    hasUpper: boolean;
    hasLower: boolean;
    hasNumber: boolean;
    hasSymbol: boolean;
  };
}

function evaluateStrength(password: string): StrengthResult {
  const checks = {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSymbol: /[^A-Za-z0-9]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;

  let label = 'Muy debil';
  let color = 'text-red-600';
  let barColor = 'bg-red-500';

  if (score >= 5) {
    label = 'Muy fuerte';
    color = 'text-emerald-600';
    barColor = 'bg-emerald-500';
  } else if (score >= 4) {
    label = 'Fuerte';
    color = 'text-emerald-500';
    barColor = 'bg-emerald-400';
  } else if (score >= 3) {
    label = 'Media';
    color = 'text-amber-600';
    barColor = 'bg-amber-500';
  } else if (score >= 2) {
    label = 'Debil';
    color = 'text-orange-600';
    barColor = 'bg-orange-500';
  }

  return { score, label, color, barColor, checks };
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    { error, label, hint, showStrength = true, id, className = '', onChange, ...rest },
    ref
  ) {
    const inputId = id ?? rest.name;
    const [password, setPassword] = useState('');
    const [show, setShow] = useState(false);

    const strength = useMemo(() => evaluateStrength(password), [password]);

    return (
      <div>
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              onChange?.(e);
            }}
            className={`w-full rounded-md border bg-background px-3 py-2 pr-10 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 ${
              error ? 'border-destructive' : ''
            } ${className}`}
            {...rest}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            tabIndex={-1}
          >
            {show ? 'Ocultar' : 'Ver'}
          </button>
        </div>

        {showStrength && password.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Seguridad</span>
              <span className={`font-medium ${strength.color}`}>
                {strength.label}
              </span>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full ${
                    i <= strength.score ? strength.barColor : 'bg-muted'
                  }`}
                />
              ))}
            </div>
            <ul className="space-y-0.5 text-xs">
              <li className={strength.checks.minLength ? 'text-emerald-600' : 'text-muted-foreground'}>
                {strength.checks.minLength ? '✓' : '○'} Minimo 8 caracteres
              </li>
              <li className={strength.checks.hasUpper ? 'text-emerald-600' : 'text-muted-foreground'}>
                {strength.checks.hasUpper ? '✓' : '○'} Al menos una mayuscula
              </li>
              <li className={strength.checks.hasLower ? 'text-emerald-600' : 'text-muted-foreground'}>
                {strength.checks.hasLower ? '✓' : '○'} Al menos una minuscula
              </li>
              <li className={strength.checks.hasNumber ? 'text-emerald-600' : 'text-muted-foreground'}>
                {strength.checks.hasNumber ? '✓' : '○'} Al menos un numero
              </li>
              <li className={strength.checks.hasSymbol ? 'text-emerald-600' : 'text-muted-foreground'}>
                {strength.checks.hasSymbol ? '✓' : '○'} Al menos un simbolo (!@#$%...)
              </li>
            </ul>
          </div>
        )}

        {hint && !error && (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        )}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    );
  }
);