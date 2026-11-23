import { formatDate, titleCase } from '@/format';
import { useI18n } from '@/i18n';
import { EmptyState, Tone } from '@/components/shared';

const tone = {
  NOMINEE_ALERT_DISPATCHED: 'blue', PAYMENT_FROZEN: 'red', STEP_EXPIRED_ROLLBACK: 'red', STEP_FAILED_ROLLBACK: 'red',
  FLIGHT_READINESS_REVOKED: 'amber', PAYMENT_UNFROZEN: 'green', FLIGHT_READY: 'green', JOURNEY_CREATED: 'muted',
};

function describe(alert, t) {
  const details = alert.details ?? {};
  if (details.message) return details.message;
  if (details.reason) return details.reason;
  if (alert.action === 'STEP_EXPIRED_ROLLBACK') {
    return t('alerts.stepExpired', { step: t(`step.${details.stepName}`, {}, titleCase(details.stepName)), count: details.reopenedSteps?.length ?? 0 });
  }
  return null;
}

export default function AlertFeed({ alerts = [] }) {
  const { t } = useI18n();
  if (!alerts.length) return <EmptyState title={t('alerts.empty')}>{t('alerts.emptyBody')}</EmptyState>;
  return (
    <ul className="max-h-96 space-y-3 overflow-y-auto pr-1">
      {alerts.map(alert => {
        const text = describe(alert, t);
        return (
          <li key={alert.id} className="border-l-2 pl-3">
            <div className="flex items-center justify-between gap-2">
              <Tone tone={tone[alert.action]}>{t(`action.${alert.action}`, {}, titleCase(alert.action.toLowerCase()))}</Tone>
              <time className="text-[11px] text-muted-foreground" dateTime={alert.created_at}>{formatDate(alert.created_at, true)}</time>
            </div>
            {text && <p className="mt-1 text-xs text-muted-foreground">{text}</p>}
          </li>
        );
      })}
    </ul>
  );
}
