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

// `size="lg"` is the login-page lockup: 1.5x the nav size with a slight slant,
// capped by screen width so it always fits on small phones.
export default function Brand({ className, subtitle = true, tone = 'dark', size = 'md' }) {
  const large = size === 'lg';
  return (
    <span className={cn('flex items-center', large ? 'gap-3' : 'gap-2.5', className)}>
      <ShieldMark className={cn('shrink-0', large ? 'h-auto w-[min(42px,12vw)]' : 'h-[30px] w-[26px] sm:h-[34px] sm:w-[30px]')} />
      <span className="leading-none">
        <span
          className={cn(
            'block font-heading font-bold',
            large ? 'origin-bottom-left -skew-x-8 text-[min(calc(clamp(17px,1.6vw,20px)*1.5),8.4vw)] leading-[1.05] tracking-[-0.01em]' : 'text-[17px] sm:text-[19px]',
            tone === 'dark' ? 'text-[#EDEFE4]' : 'text-foreground',
          )}
        >
          ProbashiShield
        </span>
        {subtitle && (
          <span className={cn('mt-0.5 block', large ? 'mt-1 text-[13.5px]' : 'text-[11px]', tone === 'dark' ? 'text-[#9FB3A7]' : 'text-muted-foreground')}>
            প্রবাসী শিল্ড
          </span>
        )}
      </span>
    </span>
  );
}
