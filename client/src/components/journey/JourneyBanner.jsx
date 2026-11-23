import { Lock, Plane, PlaneTakeoff, Timer } from 'lucide-react';
import { useI18n } from '@/i18n';

function PlanColumn({ label, children }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export default function JourneyBanner({ journey, recoveryPlan }) {
  const { t } = useI18n();
  const stepName = step => `${step.stepOrder}. ${t(`step.${step.stepName}`, {}, step.stepName)}`;
  const next = recoveryPlan.nextRequiredAction;
  const nextText = next ? t('banner.nextStep', { order: next.stepOrder, step: t(`step.${next.stepName}`) }) : '—';
  if (journey.payment_frozen) {
    return (
      <section className="ps-frozen rounded-xl bg-red-700 p-5 text-white" role="alert" aria-labelledby="frozen-title">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-white/15"><Lock className="size-5" aria-hidden="true" /></span>
          <div>
            <h2 id="frozen-title" className="font-semibold tracking-wide">{t('banner.frozen')}</h2>
            <p className="text-sm opacity-80">{t('banner.frozenSub')}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 rounded-lg bg-black/20 p-4 sm:grid-cols-3">
          <PlanColumn label={t('banner.blockedBy')}>
            {recoveryPlan.blockedBySteps.map(step => <p key={step.stepOrder}>{stepName(step)} · {t(`status.${step.status}`)}</p>)}
          </PlanColumn>
          <PlanColumn label={t('banner.rolledBack')}>
            {recoveryPlan.reopenedSteps.length ? recoveryPlan.reopenedSteps.map(step => <p key={step.stepOrder}>{stepName(step)}</p>) : <p>{t('common.none')}</p>}
          </PlanColumn>
          <PlanColumn label={t('banner.next')}>
            <p>{nextText}</p>
          </PlanColumn>
        </div>
      </section>
    );
  }
  if (journey.overall_status === 'completed') {
    return (
      <section className="flex items-center gap-3 rounded-xl bg-emerald-600 p-5 text-white" role="status">
        <Plane className="size-5" aria-hidden="true" /><h2 className="font-semibold">{t('banner.completed')}</h2>
      </section>
    );
  }
  if (journey.flight_ready) {
    return (
      <section className="flex items-center gap-3 rounded-xl bg-emerald-600 p-5 text-white animate-in fade-in-0" role="status">
        <span className="flex size-10 items-center justify-center rounded-full bg-white/15"><PlaneTakeoff className="size-5" aria-hidden="true" /></span>
        <div>
          <h2 className="font-semibold tracking-wide">{t('banner.flightReady')}</h2>
          <p className="text-sm opacity-85">{t('banner.flightReadySub')}</p>
        </div>
      </section>
    );
  }
  return (
    <section className="flex items-center gap-3 rounded-xl border bg-card p-4" role="status">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted"><Timer className="size-5 text-muted-foreground" aria-hidden="true" /></span>
      <div>
        <h2 className="font-semibold">{t('banner.inProgress')}</h2>
        <p className="text-sm text-muted-foreground">{next ? nextText : ''}</p>
      </div>
    </section>
  );
}
