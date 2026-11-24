import { cn } from '@/lib/utils';
import { formatDate, titleCase } from '@/format';
import { useI18n } from '@/i18n';
import { EmptyState, Tone } from '@/components/shared';

const tone = {
  NOMINEE_ALERT_DISPATCHED: 'muted', PAYMENT_FROZEN: 'red', STEP_EXPIRED_ROLLBACK: 'amber', STEP_FAILED_ROLLBACK: 'amber',
  FLIGHT_READINESS_REVOKED: 'red', PAYMENT_UNFROZEN: 'green', FLIGHT_READY: 'green', JOURNEY_CREATED: 'muted',
};
const dot = { muted: 'bg-muted-foreground', red: 'bg-brick', amber: 'bg-gold', green: 'bg-pass' };

const stepLabel = (name, t) => t(`step.${name}`, {}, titleCase(name ?? ''));

// Server reasons name steps as "step 2 (medical)"; pull those out so the text can be rebuilt in any language.
function stepsIn(text, t, lang) {
  const names = [...String(text ?? '').matchAll(/\((\w+)\)/g)].map(match => stepLabel(match[1], t));
  return names.length ? names.join(lang === 'bn' ? ' ও ' : ' and ') : null;
}

// Rebuild known alerts from their structured details; untranslated free text is only shown in English.
function describe(alert, t, lang) {
  const details = alert.details ?? {};
  const english = details.message || details.reason || null;
  switch (alert.action) {
    case 'STEP_EXPIRED_ROLLBACK':
      return t('alerts.stepExpired', { step: stepLabel(details.stepName, t), count: details.reopenedSteps?.length ?? 0 });
    case 'STEP_FAILED_ROLLBACK':
      return t('alerts.failedRollback', { count: details.reopenedSteps?.length ?? 0 });
    case 'PAYMENT_FROZEN': {
      const steps = stepsIn(details.reason, t, lang);
      return steps ? t('alerts.frozen', { steps }) : lang === 'bn' ? null : english;
    }
    case 'PAYMENT_UNFROZEN':
      return t('alerts.unfrozen');
    case 'NOMINEE_ALERT_DISPATCHED': {
      const id = alert.entity_id ?? details.message?.match(/Journey (\d+)/)?.[1] ?? '';
      const recovered = /recovered/i.test(details.message ?? '');
      return t(recovered ? 'alerts.nomineeRecovered' : 'alerts.nomineeBlocked', { id });
    }
    default:
      return lang === 'bn' ? null : english;
  }
}

// A dashed timeline: one dot per event, coloured by what the event means.
export default function AlertFeed({ alerts = [] }) {
  const { t, lang } = useI18n();
  if (!alerts.length) return <EmptyState title={t('alerts.empty')}>{t('alerts.emptyBody')}</EmptyState>;
  return (
    <div className="max-h-[360px] overflow-y-auto pr-1">
      <ol className="flex flex-col gap-4 border-l-2 border-dashed border-foreground/16 pl-[18px]">
        {alerts.map(alert => {
          const text = describe(alert, t, lang);
          const kind = tone[alert.action] ?? 'muted';
          return (
            <li key={alert.id} className="relative">
              <span className={cn('absolute top-[5px] -left-[24px] size-[9px] rounded-full', dot[kind])} aria-hidden="true" />
              <Tone tone={kind} className="h-auto px-2 py-0.5 text-[10.5px] font-bold">{t(`action.${alert.action}`, {}, titleCase(alert.action.toLowerCase()))}</Tone>
              <time className="mt-1 block text-[11px] text-muted-foreground" dateTime={alert.created_at}>{formatDate(alert.created_at, true)}</time>
              {text && <p className="mt-1 text-[12.5px] leading-normal">{text}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
