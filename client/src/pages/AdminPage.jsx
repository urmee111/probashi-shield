import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import api, { apiError } from '@/api';
import { formatDate, formatNumber, titleCase } from '@/format';
import { useI18n } from '@/i18n';
import { ErrorAlert, KpiCard, PageHeader, Spinner, SwitchRow, Tone, VerdictBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const FILTERS = ['', 'UNAUTHORIZED_ACCESS_ATTEMPT', 'STEP_EXPIRED_ROLLBACK', 'PAYMENT_FROZEN', 'NOMINEE_ALERT_DISPATCHED', 'DOCUMENT_AUDIT_COMPLETED', 'JOURNEY_CREATED'];
const actionTone = {
  UNAUTHORIZED_ACCESS_ATTEMPT: 'critical', STEP_EXPIRED_ROLLBACK: 'red', STEP_FAILED_ROLLBACK: 'red', PAYMENT_FROZEN: 'red',
  FLIGHT_READINESS_REVOKED: 'amber', NOMINEE_ALERT_DISPATCHED: 'blue', PAYMENT_UNFROZEN: 'green', FLIGHT_READY: 'green',
};

function Overview({ overview }) {
  const { t } = useI18n();
  const verdicts = Object.fromEntries(overview.audits.byFeeVerdict.map(row => [row.feeVerdict, row.count]));
  const totalUsers = Object.values(overview.users).reduce((sum, count) => sum + count, 0);
  const journeys = overview.journeys.byOverallStatus;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label={t('admin.users')} value={totalUsers} hint={Object.entries(overview.users).map(([role, count]) => `${count} ${t(`role.${role}`, {}, role)}`).join(' · ')} />
        <KpiCard label={t('admin.agenciesReview')} value={`${overview.agencies.flagged ?? 0} / ${overview.agencies.revoked ?? 0}`} hint={t('admin.flaggedRevoked')} tone="amber" />
        <KpiCard label={t('admin.avgFraud')} value={overview.audits.avgMlFraudProbability == null ? '—' : `${formatNumber(overview.audits.avgMlFraudProbability, 1)}%`} hint={t('admin.auditCount', { count: overview.audits.total })} tone="red" />
        <KpiCard label={t('admin.security')} value={overview.security.unauthorizedAccessAttempts} hint={overview.security.latestAttemptAt ? t('admin.latest', { date: formatDate(overview.security.latestAttemptAt, true) }) : t('common.none')} tone="red" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card size="sm">
          <CardHeader><CardTitle>{t('admin.verdicts')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-2 text-center">
              {['Red', 'Amber', 'Green', 'Unassessed'].map(verdict => (
                <div key={verdict} className="space-y-1">
                  <p className="text-2xl font-semibold tabular-nums">{verdicts[verdict] ?? 0}</p>
                  {verdict === 'Unassessed' ? <Tone>{t('admin.unassessed')}</Tone> : <VerdictBadge verdict={verdict} />}
                </div>
              ))}
            </div>
            {overview.audits.overchargeByCountry.length > 0 && (
              <Table>
                <TableHeader><TableRow><TableHead>{t('dir.country')}</TableHead><TableHead className="text-right">{t('admin.audits')}</TableHead><TableHead className="text-right">{t('admin.avg')}</TableHead><TableHead className="text-right">{t('admin.max')}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {overview.audits.overchargeByCountry.map(row => (
                    <TableRow key={row.country}>
                      <TableCell>{row.country}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.audits}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(row.avgOverchargeMultiple)}×</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(row.maxOverchargeMultiple)}×</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardTitle>{t('admin.journeys')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[[t('journeyStatus.blocked_recovery'), journeys.blocked_recovery, 'text-brick'], [t('journeyStatus.ready_for_flight'), journeys.ready_for_flight, 'text-pass'], [t('journeyStatus.in_progress'), journeys.in_progress, '']].map(([label, value, color]) => (
                <div key={label} className="rounded-lg bg-muted/50 py-3">
                  <p className={cn('text-2xl font-semibold tabular-nums', color)}>{value ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t('admin.frozenNote', { frozen: overview.journeys.paymentFrozen, completed: journeys.completed ?? 0 })}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { t } = useI18n();
  const [overview, setOverview] = useState(null);
  const [logs, setLogs] = useState([]);
  const [action, setAction] = useState('');
  const [limit, setLimit] = useState(50);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit };
      if (action) params.action = action;
      const [overviewResponse, logResponse] = await Promise.all([
        api.get('/admin/overview'),
        api.get('/admin/audit-logs', { params }),
      ]);
      setOverview(overviewResponse.data);
      setLogs(logResponse.data.logs);
      setError(null);
    } catch (failure) {
      setError(apiError(failure));
    } finally {
      setLoading(false);
    }
  }, [action, limit]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [live, refresh]);

  return (
    <>
      <PageHeader title={t('admin.title')} description={t('admin.description')}>
        <SwitchRow id="live" label={t('admin.live')} checked={live} onChange={setLive} className="gap-2" />
        <Button variant="outline" onClick={refresh} disabled={loading}>{loading ? <Spinner /> : <RefreshCw />}{t('common.refresh')}</Button>
      </PageHeader>
      <ErrorAlert error={error} />
      {overview ? <Overview overview={overview} /> : !error && <div className="flex justify-center py-10"><Spinner className="size-6" /></div>}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('admin.log')}</CardTitle>
          <CardAction>
            <NativeSelect aria-label={t('admin.rowsLabel')} size="sm" value={limit} onChange={event => setLimit(Number(event.target.value))}>
              {[25, 50, 100, 200].map(value => <NativeSelectOption key={value} value={value}>{t('admin.rows', { count: value })}</NativeSelectOption>)}
            </NativeSelect>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('admin.filter')}>
            {FILTERS.map(filter => (
              <Button key={filter || 'all'} size="sm" variant={action === filter ? 'default' : 'outline'} aria-pressed={action === filter} onClick={() => setAction(filter)}>
                {filter ? t(`action.${filter}`, {}, titleCase(filter.toLowerCase())) : t('admin.all')}
              </Button>
            ))}
          </div>
          <Table>
            <TableHeader>
              <TableRow><TableHead>{t('admin.time')}</TableHead><TableHead>{t('admin.action')}</TableHead><TableHead>{t('admin.actor')}</TableHead><TableHead>{t('admin.entity')}</TableHead><TableHead>{t('admin.details')}</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {logs.map(log => (
                <TableRow key={log.id} className={log.action === 'UNAUTHORIZED_ACCESS_ATTEMPT' ? 'bg-brick/6' : ''}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(log.created_at, true)}</TableCell>
                  <TableCell><Tone tone={actionTone[log.action]}>{log.action}</Tone></TableCell>
                  <TableCell className="text-xs">
                    {log.actor ? <><p className="font-medium">{log.actor.name}</p><p className="text-muted-foreground">{t(`role.${log.actor.role}`, {}, log.actor.role)}</p></> : <span className="text-muted-foreground">{t('admin.system')}</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{log.entity_type} #{log.entity_id}</TableCell>
                  <TableCell className="max-w-64"><code className="block truncate text-[11px] text-muted-foreground" title={JSON.stringify(log.details)}>{log.details ? JSON.stringify(log.details) : '—'}</code></TableCell>
                </TableRow>
              ))}
              {!logs.length && <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">{t('admin.noEntries')}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
