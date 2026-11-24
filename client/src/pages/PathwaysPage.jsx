import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Route, SlidersHorizontal, Sparkles, XCircle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import api, { apiError } from '@/api';
import { notify } from '@/lib/notify';
import { formatBdt } from '@/format';
import { useI18n } from '@/i18n';
import { AgencyStatusBadge, ErrorAlert, Field, PageHeader, RiskLevelBadge, Spinner, SwitchRow, Tone } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

const INITIAL = { preferredCountry: '', minSalaryBdt: '45000', maxFeeBdt: '120000', allowHighRisk: false };
const CONFLICT_DEMO = { preferredCountry: 'Malaysia', minSalaryBdt: '40000', maxFeeBdt: '50000', allowHighRisk: false };
const AMOUNT = /^\d{1,10}(\.\d{1,2})?$/;
const collideClass = 'border-brick ring-3 ring-brick/20';

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

// A short stretch of the winding road: Dhaka on the left, the destination on the right.
function MiniRoute({ to, className }) {
  const { t } = useI18n();
  return (
    <div className={cn('flex items-center gap-2 text-[11px] font-semibold', className)}>
      <span className="shrink-0 text-muted-foreground">{t('path.from')}</span>
      <span className="size-2 shrink-0 rounded-full bg-pass" aria-hidden="true" />
      <svg className="h-5 min-w-0 flex-1" viewBox="0 0 120 20" preserveAspectRatio="none" aria-hidden="true">
        <path className="ps-wave" d="M2,10 C30,0 55,20 80,10 C100,3 110,10 118,10" stroke="rgb(16 36 28 / 0.3)" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      </svg>
      <span className="size-2 shrink-0 rounded-full bg-gold" aria-hidden="true" />
      <span className="shrink-0 text-foreground">{to}</span>
    </div>
  );
}

function SummaryColumn({ label, value }) {
  return (
    <div className="border-card/15 px-5 py-3 not-last:border-b sm:not-last:border-r sm:not-last:border-b-0">
      <p className="text-[11px] text-card/75">{label}</p>
      <p className="mt-0.5 font-heading text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function FoundBanner({ pathways }) {
  const { t } = useI18n();
  const bestNet = Math.max(...pathways.map(pathway => Number(pathway.firstYearNetBdt) || 0));
  const lowestCap = Math.min(...pathways.map(pathway => Number(pathway.corridor.max_legal_fee_bdt) || Infinity));
  const verified = pathways.filter(pathway => pathway.agency.status === 'verified').length;
  return (
    <section className="flex flex-wrap items-center gap-5 rounded-[18px] bg-pass p-5 text-card sm:px-7 sm:py-6" role="status">
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/12"><CheckCircle2 className="size-6" aria-hidden="true" /></span>
      <div className="min-w-[200px] flex-[1_1_220px]">
        <h2 className="text-[21px] leading-tight font-bold">{t('path.found', { count: pathways.length })}</h2>
        <p className="mt-1 text-sm text-card/80">{t('path.ranked')}</p>
      </div>
      <div className="grid w-full overflow-hidden rounded-xl bg-ink/25 sm:grid-cols-3 xl:w-auto">
        <SummaryColumn label={t('path.summaryBest')} value={formatBdt(bestNet)} />
        <SummaryColumn label={t('path.summaryCap')} value={Number.isFinite(lowestCap) ? formatBdt(lowestCap) : '—'} />
        <SummaryColumn label={t('path.summaryVerified')} value={`${verified} / ${pathways.length}`} />
      </div>
    </section>
  );
}

// The one bold moment on this screen: nothing legal fits, so the banner pulses.
function BlockedBanner({ count }) {
  const { t } = useI18n();
  return (
    <section className="flex flex-wrap items-center gap-5 rounded-[18px] bg-[#7F3129] p-5 text-[#FBE8E4] sm:px-7 sm:py-6" role="alert">
      <span className="ps-ring grid size-12 shrink-0 place-items-center rounded-full bg-brick"><XCircle className="size-6" aria-hidden="true" /></span>
      <div className="min-w-[200px] flex-1">
        <h2 className="text-[21px] leading-tight font-bold">{t('path.none')}</h2>
        <p className="mt-1 text-sm text-[#F0C9C2]">{t('path.conflicts', { count })}</p>
      </div>
    </section>
  );
}

// Full monthly range (e.g. "35,000–52,000 BDT") so it is clear why a salary target matched.
function salaryText({ min_expected_salary_bdt: min, max_expected_salary_bdt: max }) {
  if (min == null || max == null) return formatBdt(min ?? max);
  return `${formatBdt(min).replace(' BDT', '')}–${formatBdt(max)}`;
}

function PathwayCard({ pathway, rank }) {
  const { t } = useI18n();
  const { corridor, agency } = pathway;
  const best = rank === 1;
  return (
    <article className={cn('flex h-full flex-col rounded-[18px] border bg-card transition-colors', best ? 'border-gold/70' : 'border-foreground/8 hover:border-foreground/20')}>
      <div className="space-y-3.5 p-5">
        <div className="flex items-start gap-3">
          <span className={cn('font-heading text-[26px] leading-none font-bold tabular-nums', best ? 'text-gold' : 'text-foreground/25')}>{String(rank).padStart(2, '0')}</span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base leading-tight font-bold">{corridor.country}</h3>
            <p className="text-xs text-muted-foreground">{corridor.job_category ?? t('path.allCategories')}</p>
            {best && <Tone tone="amber" className="mt-1.5">{t('path.best')}</Tone>}
          </div>
          <RiskLevelBadge level={corridor.corridor_risk_level} />
        </div>
        <MiniRoute to={corridor.country} />
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-3">
          <div><dt className="text-[11px] text-muted-foreground">{t('path.feeCap')}</dt><dd className="font-heading text-sm font-bold whitespace-nowrap tabular-nums">{formatBdt(corridor.max_legal_fee_bdt)}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">{t(corridor.max_expected_salary_bdt != null ? 'path.salaryRange' : 'path.salaryFrom')}</dt><dd className="font-heading text-sm font-bold tabular-nums">{salaryText(corridor)}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">{t('path.firstYear')}</dt><dd className="font-heading text-sm font-bold whitespace-nowrap text-pass tabular-nums">{formatBdt(pathway.firstYearNetBdt)}</dd></div>
        </dl>
      </div>
      {/* Perforated stub, like the tear-off part of a ticket. */}
      <div className="mt-auto space-y-1.5 border-t border-dashed border-foreground/16 px-5 pt-3 pb-4">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0 truncate font-semibold">{agency.name} · <span className="font-normal text-muted-foreground">{agency.license_no}</span></span>
          <AgencyStatusBadge status={agency.status} />
        </div>
        <p className="line-clamp-2 text-[11px] text-muted-foreground" title={corridor.rule_source}>{corridor.rule_source}</p>
      </div>
    </article>
  );
}

function EmptyRoute() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-foreground/16 px-6 py-12 text-center">
      <MiniRoute to="?" className="w-56" />
      <p className="text-sm font-bold">{t('path.empty')}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{t('path.emptyBody')}</p>
    </div>
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
        <Button variant="outline" className="h-11" onClick={runDemo} disabled={busy}><Zap />{t('path.conflictDemo')}</Button>
      </PageHeader>

      <div className="grid items-start gap-7 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-[18px] border border-foreground/8 bg-card lg:sticky lg:top-24" aria-labelledby="constraints-title">
          <div className="flex items-center gap-2.5 bg-ink px-5 py-4 text-[#EDEFE4]">
            <span className="grid size-8 place-items-center rounded-full bg-gold text-ink"><SlidersHorizontal className="size-4" aria-hidden="true" /></span>
            <h2 id="constraints-title" className="text-[15px] font-bold">{t('path.constraints')}</h2>
          </div>
          <form className="space-y-4 p-5" onSubmit={event => { event.preventDefault(); run(); }}>
            <Field id="pf-country" label={t('path.country')}>
              <NativeSelect
                id="pf-country" className={cn('w-full', colliding.has('preferredCountry') && '[&_select]:border-brick')}
                value={form.preferredCountry} onChange={set('preferredCountry')}
              >
                <NativeSelectOption value="">{t('path.any')}</NativeSelectOption>
                {countries.map(country => <NativeSelectOption key={country} value={country}>{country}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <Field id="pf-salary" label={t('path.salary')}>
              <Input
                id="pf-salary" inputMode="decimal" value={form.minSalaryBdt} onChange={set('minSalaryBdt')}
                aria-invalid={!AMOUNT.test(form.minSalaryBdt)} className={cn('h-11', colliding.has('minSalaryBdt') && collideClass)}
              />
            </Field>
            <Field id="pf-budget" label={t('path.budget')}>
              <Input
                id="pf-budget" inputMode="decimal" value={form.maxFeeBdt} onChange={set('maxFeeBdt')}
                aria-invalid={!AMOUNT.test(form.maxFeeBdt)} className={cn('h-11', colliding.has('maxFeeBdt') && collideClass)}
              />
            </Field>
            <SwitchRow
              id="pf-risk" label={t('path.allowRisk')} checked={form.allowHighRisk}
              onChange={value => setForm(current => ({ ...current, allowHighRisk: value }))}
              className={cn('min-h-11 rounded-md', colliding.has('allowHighRisk') && 'bg-brick/8 px-2')}
            />
            <Button type="submit" variant="gold" className="h-11 w-full" disabled={busy}>{busy ? <Spinner /> : <Route />}{t('path.find')}</Button>
          </form>
        </section>

        <div className={cn('min-w-0 space-y-5 transition-opacity', busy && result && 'opacity-50')} aria-live="polite" aria-busy={busy}>
          <ErrorAlert error={error} className="mb-0" />
          {busy && !result && <div className="flex justify-center py-10"><Spinner className="size-6" /></div>}
          {!result && !error && !busy && <EmptyRoute />}

          {result?.feasible && (
            <>
              <FoundBanner pathways={pathways} />
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {(showAll ? pathways : pathways.slice(0, 6)).map((pathway, index) => (
                  <PathwayCard key={`${pathway.corridor.id}-${pathway.agency.id}`} pathway={pathway} rank={index + 1} />
                ))}
              </div>
              {pathways.length > 6 && (
                <Button variant="outline" className="h-11 w-full" onClick={() => setShowAll(value => !value)}>
                  {showAll ? t('path.showFewer') : t('path.showAll', { count: pathways.length })}
                </Button>
              )}
            </>
          )}

          {result && !result.feasible && (
            <>
              <BlockedBanner count={result.conflicts.length} />
              <Card>
                <CardHeader><CardTitle>{t('path.colliding')}</CardTitle></CardHeader>
                <CardContent>
                  <ol className="flex flex-col gap-4 border-l-2 border-dashed border-foreground/16 pl-[18px]">
                    {result.conflicts.map(conflict => (
                      <li key={conflict.constraints.join('+')} className="relative">
                        <span className="absolute top-[7px] -left-[24px] size-[9px] rounded-full bg-brick" aria-hidden="true" />
                        <div className="flex flex-wrap gap-1">
                          {conflict.constraints.map(name => <Tone key={name} tone="red">{t(`constraint.${name}`, {}, name)}</Tone>)}
                        </div>
                        <p className="mt-1.5 text-[13px] leading-normal text-muted-foreground">{conflict.reason}</p>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>

              {result.relaxationSuggestions.length > 0 && (
                <div className="grid gap-5 sm:grid-cols-2">
                  {result.relaxationSuggestions.map(suggestion => (
                    <article key={`${suggestion.country}-${suggestion.jobCategory}`} className="flex h-full flex-col gap-3 rounded-[18px] border border-foreground/8 bg-card p-5">
                      <div>
                        <p className="text-[11px] text-muted-foreground">{t('path.minimal')}</p>
                        <h3 className="text-base font-bold">{suggestion.country}{suggestion.jobCategory ? ` · ${suggestion.jobCategory}` : ''}</h3>
                      </div>
                      <MiniRoute to={suggestion.country} />
                      <ul className="space-y-1 text-[13px] text-muted-foreground">
                        {suggestion.changes.map(change => <li key={change.constraint}>{change.description}</li>)}
                      </ul>
                      <Button variant="gold" className="mt-auto h-11" disabled={busy} onClick={() => applyRelaxation(suggestion)}>
                        <Sparkles />{t('path.apply')}
                      </Button>
                    </article>
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
