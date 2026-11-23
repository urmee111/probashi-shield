import { Check, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/format';
import { useI18n } from '@/i18n';
import { Spinner, StatusPill } from '@/components/shared';
import { Button } from '@/components/ui/button';

const dotStyle = {
  passed: 'border-emerald-600 bg-emerald-600 text-white',
  in_progress: 'border-sky-500 text-sky-600',
  reopened: 'border-amber-500 bg-amber-50 text-amber-700',
  expired: 'border-red-600 bg-red-600 text-white ps-pulse',
  failed: 'border-red-600 bg-red-600 text-white ps-pulse',
  pending: 'border-border text-muted-foreground',
};

export default function JourneyStepper({ steps, canEdit, busyStep, onPass, onFail }) {
  const { t } = useI18n();
  return (
    <ol className="grid gap-3 sm:grid-cols-7" aria-label={t('stepper.label')}>
      {steps.map((step, index) => {
        const expired = step.expires_at && new Date(step.expires_at) < new Date();
        return (
          <li key={step.step_order} className="relative flex gap-3 sm:flex-col sm:items-center sm:text-center">
            {index > 0 && (
              <span
                aria-hidden="true"
                className={cn('absolute top-4 right-1/2 hidden h-0.5 w-[calc(100%+0.75rem)] sm:block', steps[index - 1].status === 'passed' ? 'bg-emerald-500' : 'bg-border')}
              />
            )}
            <span className={cn('relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-background text-sm font-semibold', dotStyle[step.status])}>
              {step.status === 'passed' ? <Check className="size-4" /> : step.status === 'reopened' ? <RotateCcw className="size-3.5" /> : step.step_order}
            </span>
            <div className="flex min-w-0 flex-col gap-1 sm:items-center">
              <p className="text-xs font-medium leading-tight">{t(`step.${step.step_name}`, {}, step.step_name)}</p>
              <StatusPill status={step.status} />
              {step.expires_at && (
                <p className={cn('text-[11px]', expired ? 'font-medium text-red-600' : 'text-muted-foreground')}>
                  {t(expired ? 'stepper.expired' : 'stepper.until', { date: formatDate(step.expires_at) })}
                </p>
              )}
              {step.retry_count > 0 && <p className="text-[11px] text-muted-foreground">{t('stepper.retry', { count: step.retry_count })}</p>}
              {canEdit && step.status !== 'passed' && (
                <div className="mt-1 flex gap-1">
                  <Button size="xs" disabled={busyStep !== null} onClick={() => onPass(step)}>
                    {busyStep === step.step_order ? <Spinner className="size-3" /> : t('stepper.pass')}
                  </Button>
                  {step.status !== 'failed' && (
                    <Button size="xs" variant="ghost" className="text-muted-foreground" disabled={busyStep !== null} onClick={() => onFail(step)}>{t('stepper.fail')}</Button>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
