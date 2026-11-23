import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import api, { apiError } from '@/api';
import { formatBdt } from '@/format';
import { useI18n } from '@/i18n';
import { AgencyStatusBadge, EmptyState, ErrorAlert, KpiCard, PageHeader, RiskLevelBadge, Spinner } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function AgencyDirectory() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('name:asc');
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const query = useDebounced(search.trim());

  useEffect(() => {
    const controller = new AbortController();
    const [sortBy, order] = sort.split(':');
    const params = { sortBy, order };
    if (query) params.search = query.slice(0, 200);
    if (status) params.status = status;
    setLoading(true);
    api.get('/agencies', { params, signal: controller.signal })
      .then(({ data }) => { setAgencies(data.agencies); setError(null); })
      .catch((failure) => { const problem = apiError(failure); if (!problem.cancelled) setError(problem); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, status, sort]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dir.registry')}</CardTitle>
        <CardAction>{loading ? <Spinner /> : <span className="text-sm text-muted-foreground">{t('dir.results', { count: agencies.length })}</span>}</CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_11rem_11rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input aria-label={t('dir.searchLabel')} type="search" className="pl-8" placeholder={t('dir.search')} value={search} onChange={event => setSearch(event.target.value)} />
          </div>
          <NativeSelect aria-label={t('dir.status')} className="w-full" value={status} onChange={event => setStatus(event.target.value)}>
            <NativeSelectOption value="">{t('dir.allStatuses')}</NativeSelectOption>
            <NativeSelectOption value="verified">{t('agency.verified')}</NativeSelectOption>
            <NativeSelectOption value="flagged">{t('agency.flagged')}</NativeSelectOption>
            <NativeSelectOption value="revoked">{t('agency.revoked')}</NativeSelectOption>
          </NativeSelect>
          <NativeSelect aria-label={t('dir.sort')} className="w-full" value={sort} onChange={event => setSort(event.target.value)}>
            <NativeSelectOption value="name:asc">{t('dir.nameAsc')}</NativeSelectOption>
            <NativeSelectOption value="name:desc">{t('dir.nameDesc')}</NativeSelectOption>
            <NativeSelectOption value="risk_score:asc">{t('dir.riskAsc')}</NativeSelectOption>
            <NativeSelectOption value="risk_score:desc">{t('dir.riskDesc')}</NativeSelectOption>
          </NativeSelect>
        </div>
        <ErrorAlert error={error} />
        {!loading && !agencies.length ? <EmptyState title={t('dir.noMatch')}>{t('dir.noMatchBody')}</EmptyState> : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>{t('dir.agency')}</TableHead><TableHead>{t('dir.licence')}</TableHead><TableHead>{t('dir.status')}</TableHead><TableHead className="text-right">{t('dir.riskScore')}</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {agencies.map(agency => (
                <TableRow key={agency.id}>
                  <TableCell className="font-medium">{agency.name}</TableCell>
                  <TableCell><code className="text-xs">{agency.license_no}</code></TableCell>
                  <TableCell><AgencyStatusBadge status={agency.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{agency.risk_score ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function CorridorTable() {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/corridors').then(({ data: response }) => setData(response)).catch(failure => setError(apiError(failure)));
  }, []);

  const corridors = useMemo(() => data?.corridors ?? [], [data]);
  const highRisk = corridors.filter(row => row.corridor_risk_level === 'high');
  const lowest = corridors.filter(row => Number(row.max_legal_fee_bdt) > 0)
    .reduce((best, row) => (!best || Number(row.max_legal_fee_bdt) < Number(best.max_legal_fee_bdt) ? row : best), null);

  if (error) return <ErrorAlert error={error} />;
  if (!data) return <div className="flex justify-center py-10"><Spinner className="size-6" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label={t('dir.corridors')} value={data.stats.totalCorridors} />
        <KpiCard label={t('dir.avgCap')} value={formatBdt(data.stats.averageLegalFeeCapBdt)} />
        <KpiCard label={t('dir.lowestCap')} value={lowest ? formatBdt(lowest.max_legal_fee_bdt) : '—'} hint={lowest?.country} tone="green" />
        <KpiCard label={t('dir.highRisk')} value={highRisk.length} hint={highRisk.map(row => row.country).join(', ')} tone="red" />
      </div>
      {highRisk.map(row => (
        <Alert key={row.id} variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t('dir.advisory', { country: row.country })}</AlertTitle>
          <AlertDescription>
            {row.max_legal_fee_bdt == null ? t('dir.noCap') : ''}{t('dir.advisoryBody')}
          </AlertDescription>
        </Alert>
      ))}
      <Card>
        <CardHeader><CardTitle>{t('dir.capsTitle')}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>{t('dir.country')}</TableHead><TableHead>{t('dir.category')}</TableHead><TableHead>{t('dir.legalCap')}</TableHead><TableHead>{t('dir.salaryRange')}</TableHead><TableHead>{t('dir.risk')}</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {corridors.map(row => (
                <TableRow key={row.id} className={row.corridor_risk_level === 'high' ? 'bg-red-50/60' : ''} title={row.rule_source}>
                  <TableCell className="font-medium">{row.country}</TableCell>
                  <TableCell className="text-muted-foreground">{row.job_category ?? '—'}</TableCell>
                  <TableCell className="tabular-nums">{row.max_legal_fee_bdt == null ? <span className="text-red-600">{t('dir.notRecorded')}</span> : formatBdt(row.max_legal_fee_bdt)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {row.min_expected_salary_bdt == null ? '—' : `${formatBdt(row.min_expected_salary_bdt)} – ${formatBdt(row.max_expected_salary_bdt)}`}
                  </TableCell>
                  <TableCell><RiskLevelBadge level={row.corridor_risk_level} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">{t('dir.note')}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DirectoryPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('dir.title')} description={t('dir.description')} />
      <div className="space-y-6">
        <CorridorTable />
        <AgencyDirectory />
      </div>
    </>
  );
}
