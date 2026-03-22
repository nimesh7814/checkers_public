import React from 'react';
import * as Flags from 'country-flag-icons/react/3x2';
import { cn } from '@/lib/utils';

type FlagComponentType = React.ComponentType<{ className?: string }>;

interface CountryFlagProps {
  code?: string | null;
  className?: string;
  title?: string;
}

const CountryFlag: React.FC<CountryFlagProps> = ({ code, className, title }) => {
  const normalized = code?.toUpperCase();
  const flagMap = Flags as unknown as Record<string, FlagComponentType>;
  const Flag = normalized ? flagMap[normalized] : undefined;

  if (!Flag) {
    return (
      <span className={cn('inline-flex items-center justify-center text-sm', className)} title={title || 'Unknown country'}>
        🌍
      </span>
    );
  }

  return (
    <span title={title || normalized}>
      <Flag className={cn('inline-block h-4 w-6 rounded-[2px]', className)} />
    </span>
  );
};

export default CountryFlag;
