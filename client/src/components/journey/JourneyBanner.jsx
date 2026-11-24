import { Plane, PlaneTakeoff, Timer } from 'lucide-react';
import { useI18n } from '@/i18n';

function PlanColumn({ label, children }) {
  return (
    <div className="border-[#FBE8E4]/18 px-6 py-3.5 not-last:border-b sm:not-last:border-r sm:not-last:border-b-0 xl:min-w-44">
      <p className="text-[11px] tracking-[0.06em] text-[#F0C9C2] uppercase">{label}</p>
      <div className="mt-1 text-[13px] font-semibold">{children}</div>
    </div>
  );
}

// Shield with an exclamation mark, used for the one bold "blocked" moment per screen.
function AlertShield() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2L21 6V11C21 16.5 17.5 20.7 12 22C6.5 20.7 3 16.5 3 11V6L12 2Z" stroke="#FBE8E4" strokeWidth="1.8" />
      <path d="M12 8V13" stroke="#FBE8E4" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.3" r="1.1" fill="#FBE8E4" />
    </svg>
  );
}

export default function JourneyBanner({ journey, recoveryPlan }) {
  const { t } = useI18n();
  const stepName = step => `${step.stepOrder}. ${t(`step.${step.stepName}`, {}, step.stepName)}`;
  const next = recoveryPlan.nextRequiredAction;
  const nextText = next ? t('banner.nextStep', { order: next.stepOrder, step: t(`step.${next.stepName}`) }) : '—';
  if (journey.payment_frozen) {
    return (
      <section className="flex flex-wrap items-center gap-6 rounded-[18px] bg-[#7F3129] p-6 text-[#FBE8E4] sm:px-[34px] sm:py-[30px]" role="alert" aria-labelledby="frozen-title">
        <span className="ps-ring grid size-14 shrink-0 place-items-center rounded-full bg-brick"><AlertShield /></span>
        <div className="min-w-[240px] flex-[1_1_300px]">
          <h2 id="frozen-title" className="text-[21px] leading-tight font-bold">{t('banner.frozen')}</h2>
          <p className="mt-1 text-sm text-[#F0C9C2]">{t('banner.frozenSub')}</p>
        </div>
        <div className="grid w-full overflow-hidden rounded-xl bg-ink/20 sm:grid-cols-3 xl:w-auto">
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
      <section className="flex items-center gap-4 rounded-[18px] bg-pass p-6 text-card sm:px-[34px]" role="status">
        <span className="grid size-14 place-items-center rounded-full bg-white/12"><Plane className="size-6" aria-hidden="true" /></span>
        <h2 className="text-[21px] font-bold">{t('banner.completed')}</h2>
      </section>
    );
  }
  if (journey.flight_ready) {
    return (
      <section className="flex items-center gap-4 rounded-[18px] bg-pass p-6 text-card animate-in fade-in-0 sm:px-[34px]" role="status">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white/12"><PlaneTakeoff className="size-6" aria-hidden="true" /></span>
        <div>
          <h2 className="text-[21px] font-bold">{t('banner.flightReady')}</h2>
          <p className="mt-1 text-sm text-card/85">{t('banner.flightReadySub')}</p>
        </div>
      </section>
    );
  }
  return (
    <section className="flex items-center gap-4 rounded-[18px] border border-foreground/8 bg-card p-5 sm:px-7" role="status">
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-pass/10"><Timer className="size-5 text-pass" aria-hidden="true" /></span>
      <div>
        <h2 className="text-lg font-bold">{t('banner.inProgress')}</h2>
        <p className="text-sm text-muted-foreground">{next ? nextText : ''}</p>
      </div>
    </section>
  );
}
