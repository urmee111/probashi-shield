import { Check, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/format';
import { useI18n } from '@/i18n';
import { Spinner, StatusPill } from '@/components/shared';

// Milestones sit on the road at alternating heights (px), like the reference route.
const OFFSETS = [0, 34, 8, 34];
const COLUMN = 168;

function wavePath(width) {
  let d = 'M20,45';
  let x = 20;
  while (x + 260 <= width - 20) {
    d += ` C${x + 90},10 ${x + 170},80 ${x + 260},45`;
    x += 260;
  }
  return `${d} C${x + 30},32 ${width - 50},45 ${width - 20},45`;
}

function Node({ step, size }) {
  const blocked = step.status === 'expired' || step.status === 'failed';
  return (
    <span
      className={cn(
        'relative z-10 grid shrink-0 place-items-center rounded-full font-heading font-bold',
        size === 'lg' ? 'size-[52px] text-xl' : 'size-11 text-lg',
        step.status === 'passed' && 'bg-pass text-white',
        blocked && 'bg-brick text-white',
        step.status === 'reopened' && 'border-[2.5px] border-gold bg-card text-gold',
        step.status === 'in_progress' && 'border-[2.5px] border-pass bg-card text-pass',
        step.status === 'pending' && 'border-2 border-foreground/22 bg-card text-muted-foreground',
      )}
      aria-hidden="true"
    >
      {step.status === 'passed' ? <Check className="size-5" strokeWidth={3} />
        : step.status === 'reopened' ? <RotateCcw className="size-5" strokeWidth={2.2} />
          : blocked ? '!' : step.step_order}
    </span>
  );
}

function StepDetails({ step, canEdit, busyStep, onPass, onFail, compact }) {
  const { t } = useI18n();
  const expired = step.expires_at && new Date(step.expires_at) < new Date();
  return (
    <>
      <p className={cn('text-[13px] leading-snug font-bold', compact && 'mt-2.5 text-balance')}>{t(`step.${step.step_name}`, {}, step.step_name)}</p>
      <span className={compact ? 'mt-[7px]' : 'mt-1'}><StatusPill status={step.status} /></span>
      {(step.expires_at || step.retry_count > 0) && (
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          {step.expires_at && (
            <span className={cn('block', expired && 'font-medium text-brick')}>
              {t(expired ? 'stepper.expired' : 'stepper.until', { date: formatDate(step.expires_at) })}
            </span>
          )}
          {step.retry_count > 0 && <span className="block">{t('stepper.retry', { count: step.retry_count })}</span>}
        </p>
      )}
      {canEdit && step.status !== 'passed' && (
        <div className={cn('flex gap-1.5', compact ? 'mt-2 flex-wrap justify-center' : 'mt-2.5')}>
          <button
            type="button" disabled={busyStep !== null} onClick={() => onPass(step)}
            className={cn('inline-flex items-center justify-center rounded-[7px] bg-pass font-semibold text-white transition hover:brightness-110 disabled:opacity-50', compact ? 'h-8 min-w-12 px-3 text-[11px] min-[1100px]:min-w-0 min-[1100px]:px-2' : 'h-11 min-w-20 px-4 text-sm')}
          >
            {busyStep === step.step_order ? <Spinner className="size-3.5" /> : t('stepper.pass')}
          </button>
          {step.status !== 'failed' && (
            <button
              type="button" disabled={busyStep !== null} onClick={() => onFail(step)}
              className={cn('inline-flex items-center justify-center rounded-[7px] border border-brick font-semibold text-brick transition hover:bg-brick/6 disabled:opacity-50', compact ? 'h-8 min-w-12 px-3 text-[11px] min-[1100px]:min-w-0 min-[1100px]:px-2' : 'h-11 min-w-20 px-4 text-sm')}
            >
              {t('stepper.fail')}
            </button>
          )}
        </div>
      )}
    </>
  );
}

export default function JourneyStepper({ steps, ...actions }) {
  const { t } = useI18n();
  const width = Math.max(steps.length * COLUMN, 640);
  return (
    <>
      {/* Tablet: a winding road that scrolls sideways. Desktop (>= 1100px): columns shrink so all steps fit in one row. */}
      <div className="ps-rail -mx-1 mt-[18px] hidden overflow-x-auto p-1 sm:block min-[1100px]:overflow-x-visible">
        <div className="relative min-w-(--rail-width) px-2.5 pt-[46px] pb-2.5 min-[1100px]:min-w-0 min-[1100px]:px-0" style={{ '--rail-width': `${width}px` }}>
          <svg className="absolute top-[34px] left-0 w-full" height="90" viewBox={`0 0 ${width} 90`} preserveAspectRatio="none" aria-hidden="true">
            <path className="ps-wave" d={wavePath(width)} stroke="rgb(16 36 28 / 0.22)" strokeWidth="2" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <ol className="relative flex justify-between gap-2 min-[1100px]:gap-1" aria-label={t('stepper.label')}>
            {steps.map((step, index) => (
              <li key={step.step_order} className="flex w-[150px] flex-col items-center text-center min-[1100px]:w-auto min-[1100px]:min-w-0 min-[1100px]:flex-1" style={{ marginTop: OFFSETS[index % OFFSETS.length] }}>
                <Node step={step} size="lg" />
                <StepDetails step={step} compact {...actions} />
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Phones: the same road runs down the page, with large tap targets. */}
      <ol className="relative mt-5 space-y-6 sm:hidden" aria-label={t('stepper.label')}>
        <span className="absolute top-3 bottom-3 left-[21px] border-l-2 border-dashed border-foreground/20" aria-hidden="true" />
        {steps.map(step => (
          <li key={step.step_order} className="relative flex gap-4">
            <Node step={step} />
            <div className="flex min-w-0 flex-col items-start pt-1">
              <StepDetails step={step} {...actions} />
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
