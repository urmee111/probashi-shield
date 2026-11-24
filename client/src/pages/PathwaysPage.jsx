import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Route, Sparkles, XCircle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import api, { apiError } from '@/api';
import { notify } from '@/lib/notify';
import { formatBdt } from '@/format';
import { useI18n } from '@/i18n';
import { AgencyStatusBadge, EmptyState, ErrorAlert, Field, PageHeader, RiskLevelBadge, Spinner, SwitchRow, Tone } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

const INITIAL = { preferredCountry: '', minSalaryBdt: '45000', maxFeeBdt: '120000', allowHighRisk: false };
const CONFLICT_DEMO = { preferredCountry: 'Malaysia', minSalaryBdt: '40000', maxFeeBdt: '50000', allowHighRisk: false };
const AMOUNT = /^\d{1,10}(\.\d{1,2})?$/;
const collideClass = 'border-red-500 ring-3 ring-red-500/20';

function toRequest(form) {
  const body = { minSalaryBdt: Number(form.minSalaryBdt), maxFeeBdt: Number(form.maxFeeBdt), allowHighRisk: form.allowHighRisk };
  if (form.preferredCountry) body.preferredCountry = form.preferredCountry;
  return body;
}

// Maps a suggestion's changes back onto the form so the optimizer can rerun.
function applyChanges(form, changes) {
  const next = { ...form };
  for (const change of changes) {
    if (change.constraint === 'preferredCountry') next.preferredCountry = change.to;
    if (change.constraint === 'minSalaryBdt') next.minSalaryBdt = String(change.to);
    if (change.constraint === 'maxFeeBdt') next.maxFeeBdt = String(change.to);
    if (change.constraint === 'allowHighRisk') next.allowHighRisk = true;
  }
  return next;
}

function ResultBanner({ ok, title, subtitle }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <div className={cn('flex items-center gap-3 rounded-xl px-4 py-3 text-white', ok ? 'bg-emerald-600' : 'bg-red-600')}>
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm opacity-85">{subtitle}</p>
      </div>
    </div>
  );
}

function PathwayCard({ pathway, rank }) {
  const { t } = useI18n();
  const { corridor, agency } = pathway;
  return (
    <Card size="sm" className="h-full transition-shadow hover:shadow-md">
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">#{rank}</p>
            <p className="font-semibold">{corridor.country}</p>
            <p className="text-xs text-muted-foreground">{corridor.job_category ?? t('path.allCategories')}</p>
          </div>
          <RiskLevelBadge level={corridor.corridor_risk_level} />
        </div>
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div><dt className="text-muted-foreground">{t('path.feeCap')}</dt><dd className="font-medium tabular-nums">{formatBdt(corridor.max_legal_fee_bdt)}</dd></div>
          <div><dt className="text-muted-foreground">{t('path.salaryFrom')}</dt><dd className="font-medium tabular-nums">{formatBdt(corridor.min_expected_salary_bdt)}</dd></div>
          <div><dt className="text-muted-foreground">{t('path.firstYear')}</dt><dd className="font-medium tabular-nums text-emerald-600">{formatBdt(pathway.firstYearNetBdt)}</dd></div>
        </dl>
        <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs">
          <span className="truncate">{agency.name} · <code>{agency.license_no}</code></span>
          <AgencyStatusBadge status={agency.status} />
        </div>
        <p className="line-clamp-2 text-[11px] text-muted-foreground" title={corridor.rule_source}>{corridor.rule_source}</p>
      </CardContent>
    </Card>
  );
}

export default function PathwaysPage() {
  const { t } = useI18n();
  const [countries, setCountries] = useState([]);
  const [form, setForm] = useState(INITIAL);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api.get('/corridors')
      .then(({ data }) => setCountries([...new Set(data.corridors.map(row => row.country))]))
      .catch(failure => setError(apiError(failure)));
  }, []);

  const colliding = useMemo(() => new Set((result?.conflicts ?? []).flatMap(conflict => conflict.constraints)), [result]);

  async function run(values = form) {
    if (!AMOUNT.test(values.minSalaryBdt) || !AMOUNT.test(values.maxFeeBdt)) {
      setError({ message: t('path.invalid') });
      return null;
    }
    setBusy(true);
    setError(null);
    setShowAll(false);
    try {
      const { data } = await api.post('/pathways/recommend', toRequest(values));
      setResult(data);
      return data;
    } catch (failure) {
      setError(apiError(failure));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function applyRelaxation(suggestion) {
    const next = applyChanges(form, suggestion.changes);
    setForm(next);
    const data = await run(next);
    if (data?.feasible) notify({ variant: 'success', title: t('path.unlocked'), body: suggestion.suggestion });
  }

  function runDemo() {
    setForm(CONFLICT_DEMO);
    run(CONFLICT_DEMO);
  }

  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const pathways = result?.pathways ?? [];

  return (
    <>
      <PageHeader title={t('path.title')} badge="A02" description={t('path.description')}>
        <Button variant="outline" onClick={runDemo} disabled={busy}><Zap />{t('path.conflictDemo')}</Button>
      </PageHeader>

      <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Card className="lg:sticky lg:top-20">
          <CardHeader><CardTitle>{t('path.constraints')}</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={event => { event.preventDefault(); run(); }}>
              <Field id="pf-country" label={t('path.country')}>
                <NativeSelect
                  id="pf-country" className={cn('w-full', colliding.has('preferredCountry') && '[&_select]:border-red-500')}
                  value={form.preferredCountry} onChange={set('preferredCountry')}
                >
                  <NativeSelectOption value="">{t('path.any')}</NativeSelectOption>
                  {countries.map(country => <NativeSelectOption key={country} value={country}>{country}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              <Field id="pf-salary" label={t('path.salary')}>
                <Input
                  id="pf-salary" inputMode="decimal" value={form.minSalaryBdt} onChange={set('minSalaryBdt')}
                  aria-invalid={!AMOUNT.test(form.minSalaryBdt)} className={cn(colliding.has('minSalaryBdt') && collideClass)}
                />
              </Field>
              <Field id="pf-budget" label={t('path.budget')}>
                <Input
                  id="pf-budget" inputMode="decimal" value={form.maxFeeBdt} onChange={set('maxFeeBdt')}
                  aria-invalid={!AMOUNT.test(form.maxFeeBdt)} className={cn(colliding.has('maxFeeBdt') && collideClass)}
                />
              </Field>
              <SwitchRow
                id="pf-risk" label={t('path.allowRisk')} checked={form.allowHighRisk}
                onChange={value => setForm(current => ({ ...current, allowHighRisk: value }))}
                className={cn('rounded-md', colliding.has('allowHighRisk') && 'bg-red-50 px-2')}
              />
              <Button type="submit" className="w-full" disabled={busy}>{busy ? <Spinner /> : <Route />}{t('path.find')}</Button>
            </form>
          </CardContent>
        </Card>

        <div className={cn('min-w-0 space-y-4 transition-opacity', busy && result && 'opacity-50')} aria-live="polite" aria-busy={busy}>
          <ErrorAlert error={error} className="mb-0" />
          {busy && !result && <div className="flex justify-center py-10"><Spinner className="size-6" /></div>}
          {!result && !error && !busy && <EmptyState title={t('path.empty')}>{t('path.emptyBody')}</EmptyState>}

          {result?.feasible && (
            <>
              <ResultBanner ok title={t('path.found', { count: pathways.length })} subtitle={t('path.ranked')} />
              <div className="grid gap-4 sm:grid-cols-2">
                {(showAll ? pathways : pathways.slice(0, 6)).map((pathway, index) => (
                  <PathwayCard key={`${pathway.corridor.id}-${pathway.agency.id}`} pathway={pathway} rank={index + 1} />
                ))}
              </div>
              {pathways.length > 6 && (
                <Button variant="ghost" className="w-full" onClick={() => setShowAll(value => !value)}>
                  {showAll ? t('path.showFewer') : t('path.showAll', { count: pathways.length })}
                </Button>
              )}
            </>
          )}

          {result && !result.feasible && (
            <>
              <ResultBanner ok={false} title={t('path.none')} subtitle={t('path.conflicts', { count: result.conflicts.length })} />
              <Card>
                <CardHeader><CardTitle>{t('path.colliding')}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {result.conflicts.map(conflict => (
                    <div key={conflict.constraints.join('+')} className="rounded-lg border-l-2 border-red-500 bg-red-50/50 px-3 py-2">
                      <div className="mb-1 flex flex-wrap gap-1">
                        {conflict.constraints.map(name => <Tone key={name} tone="red">{t(`constraint.${name}`, {}, name)}</Tone>)}
                      </div>
                      <p className="text-sm text-muted-foreground">{conflict.reason}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {result.relaxationSuggestions.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {result.relaxationSuggestions.map(suggestion => (
                    <Card key={`${suggestion.country}-${suggestion.jobCategory}`} size="sm">
                      <CardContent className="flex h-full flex-col gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">{t('path.minimal')}</p>
                          <p className="font-semibold">{suggestion.country}{suggestion.jobCategory ? ` · ${suggestion.jobCategory}` : ''}</p>
                        </div>
                        <ul className="space-y-1 text-sm">
                          {suggestion.changes.map(change => <li key={change.constraint} className="text-muted-foreground">{change.description}</li>)}
                        </ul>
                        <Button size="sm" className="mt-auto" disabled={busy} onClick={() => applyRelaxation(suggestion)}>
                          <Sparkles />{t('path.apply')}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
