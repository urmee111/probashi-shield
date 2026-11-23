import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Brand({ className, subtitle = true }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ShieldCheck className="size-4.5" aria-hidden="true" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-tight">ProbashiShield</span>
        {subtitle && <span className="block text-[11px] text-muted-foreground">প্রবাসী শিল্ড</span>}
      </span>
    </span>
  );
}
