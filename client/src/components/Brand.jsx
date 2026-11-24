import { cn } from '@/lib/utils';

// Gold shield with an ink check: the passport-seal mark used in the nav and chat.
export function ShieldMark({ className, check = true, fill = '#B9841C', ink = '#0D2B22' }) {
  return (
    <svg viewBox="0 0 30 34" fill="none" aria-hidden="true" className={className}>
      <path d="M15 1 L28 7 V16 C28 25 22 31 15 33 C8 31 2 25 2 16 V7 Z" fill={fill} />
      {check && <path d="M9 16.5 L13 20.5 L21 11.5" stroke={ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

export default function Brand({ className, subtitle = true, tone = 'dark' }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <ShieldMark className="h-[30px] w-[26px] shrink-0 sm:h-[34px] sm:w-[30px]" />
      <span className="leading-none">
        <span className={cn('block font-heading text-[17px] font-bold sm:text-[19px]', tone === 'dark' ? 'text-[#EDEFE4]' : 'text-foreground')}>ProbashiShield</span>
        {subtitle && <span className={cn('mt-0.5 block text-[11px]', tone === 'dark' ? 'text-[#9FB3A7]' : 'text-muted-foreground')}>প্রবাসী শিল্ড</span>}
      </span>
    </span>
  );
}
