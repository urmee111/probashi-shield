import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Info, Route, SlidersHorizontal, Sparkles, XCircle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import api, { apiError } from '@/api';
import { notify } from '@/lib/notify';
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

// Compact taka amounts for tight card columns: ৳95,000 in full, ৳55k for ranges and filter chips.
const takaFull = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const takaShort = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
function amount(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function taka(value) {
  const number = amount(value);
  return number === null ? '—' : `৳${takaFull.format(number)}`;
}
function takaK(value) {
  const number = amount(value);
  if (number === null) return '—';
  return number >= 1000 ? `${takaShort.format(number / 1000)}k` : takaFull.format(number);
}

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
        <path className="ps-wave text-foreground/30" d="M2,10 C30,0 55,20 80,10 C100,3 110,10 118,10" stroke="currentColor" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      </svg>
      <span className="size-2 shrink-0 rounded-full bg-gold" aria-hidden="true" />
      <span className="shrink-0 text-foreground">{to}</span>
    </div>
  );
}

function SummaryColumn({ label, value }) {
  return (
    <div className="min-w-0 border-cream/15 px-3 py-2.5 not-last:border-r sm:px-5 sm:py-3">
      <p className="text-[10.5px] leading-tight text-cream/75 sm:text-[11px]">{label}</p>
      <p className="mt-0.5 font-heading text-[15px] font-bold whitespace-nowrap tabular-nums sm:text-lg">{value}</p>
    </div>
  );
}

function FoundBanner({ pathways }) {
  const { t } = useI18n();
  const bestNet = Math.max(...pathways.map(pathway => Number(pathway.firstYearNetBdt) || 0));
  const lowestCap = Math.min(...pathways.map(pathway => Number(pathway.corridor.max_legal_fee_bdt) || Infinity));
  const verified = pathways.filter(pathway => pathway.agency.status === 'verified').length;
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-[18px] bg-pass p-4 text-cream sm:gap-5 sm:px-7 sm:py-6" role="status">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/12 sm:size-12"><CheckCircle2 className="size-5 sm:size-6" aria-hidden="true" /></span>
      <div className="min-w-0 flex-[1_1_200px]">
        <h2 className="text-lg leading-tight font-bold sm:text-[21px]">{t('path.found', { count: pathways.length })}</h2>
        <p className="mt-1 text-[13px] text-cream/80 sm:text-sm">{t('path.ranked')}</p>
      </div>
      <div className="grid w-full grid-cols-3 overflow-hidden rounded-xl bg-ink/25 xl:w-auto">
        <SummaryColumn label={t('path.summaryBest')} value={taka(bestNet)} />
        <SummaryColumn label={t('path.summaryCap')} value={Number.isFinite(lowestCap) ? taka(lowestCap) : '—'} />
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

// Monthly range (e.g. "৳35k–52k") so it is clear why a salary target matched; "৳35k+" when open-ended.
function salaryText({ min_expected_salary_bdt: min, max_expected_salary_bdt: max }) {
  if (amount(min) === null && amount(max) === null) return '—';
  if (amount(min) === null || amount(max) === null) return `৳${takaK(min ?? max)}+`;
  return `৳${takaK(min)}–${takaK(max)}`;
}

function Metric({ label, value, className }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn('font-heading text-[13px] font-bold whitespace-nowrap tabular-nums sm:text-sm', className)}>{value}</dd>
    </div>
  );
}

function PathwayCard({ pathway, rank }) {
  const { t } = useI18n();
  const { corridor, agency } = pathway;
  const best = rank === 1;
  return (
    <article className={cn('flex h-full flex-col rounded-[18px] border bg-card transition-colors', best ? 'border-gold/70' : 'border-foreground/8 hover:border-foreground/20')}>
      <div className="space-y-3 p-4 sm:space-y-3.5 sm:p-5">
        <div className="flex items-start gap-3">
          <span className={cn('font-heading text-[22px] leading-none font-bold tabular-nums sm:text-[26px]', best ? 'text-gold' : 'text-foreground/25')}>{String(rank).padStart(2, '0')}</span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base leading-tight font-bold">{corridor.country}</h3>
            <p className="text-xs text-muted-foreground">{corridor.job_category ?? t('path.allCategories')}</p>
            {best && <Tone tone="amber" className="mt-1.5">{t('path.best')}</Tone>}
          </div>
          <RiskLevelBadge level={corridor.corridor_risk_level} />
        </div>
        {/* The country is already the heading, so the route sketch is skipped on phones. */}
        <MiniRoute to={corridor.country} className="hidden sm:flex" />
        <dl className="grid grid-cols-3 gap-2 sm:gap-3">
          <Metric label={t('path.feeCapShort')} value={taka(corridor.max_legal_fee_bdt)} />
          <Metric label={t('path.salaryShort')} value={salaryText(corridor)} />
          <Metric label={t('path.firstYearShort')} value={taka(pathway.firstYearNetBdt)} className="text-pass" />
        </dl>
      </div>
      {/* Perforated stub, like the tear-off part of a ticket. */}
      <div className="mt-auto flex items-center gap-2 border-t border-dashed border-foreground/16 px-4 py-3 text-xs sm:px-5">
        <p className="flex min-w-0 flex-1 items-baseline gap-1" title={`${agency.name} · ${agency.license_no}`}>
          <span className="truncate font-semibold">{agency.name}</span>
          <span className="shrink-[3] truncate text-muted-foreground">· {agency.license_no}</span>
        </p>
        <span className="shrink-0"><AgencyStatusBadge status={agency.status} /></span>
      </div>
    </article>
  );
}

// One note for the whole list instead of the same fixture disclaimer on every card. The full sources sit behind a toggle.
function SourceNote({ pathways }) {
  const { t } = useI18n();
  const sources = [...new Set(pathways.map(pathway => pathway.corridor.rule_source).filter(Boolean))];
  if (!sources.length) return null;
  return (
    <details className="group text-[11.5px] text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        <Info className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{t('path.sourceNote')}</span>
        <span className="shrink-0 font-semibold text-foreground/70 underline-offset-2 group-open:underline hover:underline">{t('path.sourceToggle')}</span>
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {sources.map(source => <li key={source}>{source}</li>)}
      </ul>
    </details>
  );
}

// Collapsed filter bar for phones: the active constraints as chips, tap to open the form.
function FilterSummary({ form, colliding }) {
  const { t } = useI18n();
  const chips = [
    ['preferredCountry', form.preferredCountry || t('path.any')],
    ['minSalaryBdt', t('path.chipSalary', { value: `৳${takaK(form.minSalaryBdt)}` })],
    ['maxFeeBdt', t('path.chipFee', { value: `৳${takaK(form.maxFeeBdt)}` })],
  ];
  if (form.allowHighRisk) chips.push(['allowHighRisk', t('path.chipRisk')]);
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {chips.map(([key, label]) => (
        <span key={key} className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', colliding.has(key) ? 'bg-brick text-cream' : 'bg-white/10 text-[#EDEFE4]')}>{label}</span>
      ))}
    </span>
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
  // Phones only: the constraint form starts collapsed so the pathway cards are visible first.
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    api.get('/corridors')
      .then(({ data }) => setCountries([...new Set(data.corridors.map(row => row.country))]))
      .catch(failure => setError(apiError(failure)));
    // Show results for the default constraints straight away instead of an empty state.
    run(INITIAL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (data.feasible) setFiltersOpen(false);
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
    <div className="pb-24">
      <PageHeader title={t('path.title')} badge="A02" description={t('path.description')}>
        <Button variant="outline" className="h-11" onClick={runDemo} disabled={busy}><Zap />{t('path.conflictDemo')}</Button>
      </PageHeader>

      <div className="grid items-start gap-7 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-[18px] border border-foreground/8 bg-card lg:sticky lg:top-24" aria-labelledby="constraints-title">
          <div className="hidden items-center gap-2.5 bg-ink px-5 py-4 text-[#EDEFE4] md:flex">
            <span className="grid size-8 place-items-center rounded-full bg-gold text-ink"><SlidersHorizontal className="size-4" aria-hidden="true" /></span>
            <h2 id="constraints-title" className="text-[15px] font-bold">{t('path.constraints')}</h2>
          </div>
          <button
            type="button" className="flex w-full items-center gap-2.5 bg-ink px-4 py-3 text-left text-[#EDEFE4] md:hidden"
            aria-expanded={filtersOpen} aria-controls="pathway-filters" onClick={() => setFiltersOpen(value => !value)}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gold text-ink"><SlidersHorizontal className="size-3.5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1 space-y-1">
              <span className="block text-[13px] font-bold">{t('path.filters')}</span>
              <FilterSummary form={form} colliding={colliding} />
            </span>
            <span className="sr-only">{filtersOpen ? t('path.filtersHide') : t('path.filtersShow')}</span>
            <ChevronDown className={cn('size-4 shrink-0 transition-transform', filtersOpen && 'rotate-180')} aria-hidden="true" />
          </button>
          <form id="pathway-filters" className={cn('space-y-4 p-5', !filtersOpen && 'max-md:hidden')} onSubmit={event => { event.preventDefault(); run(); }}>
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
              <SourceNote pathways={pathways} />
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
    </div>
  );
}
