import { useEffect, useState } from 'react';
import api, { apiError } from '@/api';
import { formatBdt, formatNumber } from '@/format';
import { useI18n } from '@/i18n';
import { FactorBars, Field, RiskGauge, Spinner, SwitchRow, TierBadge, VerdictBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';

const DEFAULT_CAPS = [{ label: 'Malaysia', cap: 78990 }];
const PRESETS = {
  scam: { fee: 450000, agencyStatus: 'flagged', mismatch: true, missingSalary: true, highRisk: false },
  legit: { fee: 75000, agencyStatus: 'verified', mismatch: false, missingSalary: false, highRisk: false },
};

export default function RiskSimulator() {
  const { t } = useI18n();
  const [caps, setCaps] = useState(DEFAULT_CAPS);
  const [state, setState] = useState({ cap: 78990, ...PRESETS.scam });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const set = key => value => setState(current => ({ ...current, [key]: value }));

  useEffect(() => {
    api.get('/corridors')
      .then(({ data }) => {
        const options = data.corridors.filter(row => Number(row.max_legal_fee_bdt) > 0)
          .map(row => ({ label: row.country, cap: Number(row.max_legal_fee_bdt) }));
        if (options.length) setCaps(options);
      })
      .catch(() => {});
  }, []);

  // Debounced (150 ms) live scoring; stale requests are aborted.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.post('/documents/simulate-risk', {
          chargedFeeBdt: state.fee,
          maxLegalFeeBdt: state.cap,
          agencyStatus: state.agencyStatus,
          agencyLicenseMismatch: state.mismatch,
          missingSalaryClause: state.missingSalary,
          corridorRiskLevel: state.highRisk ? 'high' : 'medium',
        }, { signal: controller.signal });
        setResult(data);
        setError(null);
      } catch (failure) {
        const problem = apiError(failure);
        if (!problem.cancelled) setError(problem.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('sim.title')}</CardTitle>
        <CardDescription>{t('sim.description')}</CardDescription>
        <CardAction>{loading && <Spinner />}</CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => setState(current => ({ ...current, ...PRESETS.scam }))}>{t('sim.scam')}</Button>
          <Button variant="outline" size="sm" onClick={() => setState(current => ({ ...current, ...PRESETS.legit }))}>{t('sim.legit')}</Button>
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium" id="sim-fee-label">{t('sim.fee')}</span>
            <span className="tabular-nums">{formatBdt(state.fee)}</span>
          </div>
          <Slider
            aria-labelledby="sim-fee-label" min={30000} max={600000} step={5000}
            value={[state.fee]} onValueChange={value => set('fee')(Array.isArray(value) ? value[0] : value)}
          />
        </div>

        <div className="grid gap-3">
          <Field id="sim-cap" label={t('sim.cap')}>
            <NativeSelect id="sim-cap" className="w-full" value={state.cap} onChange={event => set('cap')(Number(event.target.value))}>
              {caps.map(option => <NativeSelectOption key={option.label} value={option.cap}>{option.label} · {formatBdt(option.cap)}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field id="sim-agency" label={t('sim.agencyStatus')}>
            <NativeSelect id="sim-agency" className="w-full" value={state.agencyStatus} onChange={event => set('agencyStatus')(event.target.value)}>
              <NativeSelectOption value="verified">{t('agency.verified')}</NativeSelectOption>
              <NativeSelectOption value="flagged">{t('sim.underReview')}</NativeSelectOption>
              <NativeSelectOption value="revoked">{t('sim.revoked')}</NativeSelectOption>
            </NativeSelect>
          </Field>
        </div>

        <div className="divide-y rounded-lg border px-3">
          <SwitchRow id="sim-mismatch" label={t('sim.mismatch')} checked={state.mismatch} onChange={set('mismatch')} className="py-2.5" />
          <SwitchRow id="sim-salary" label={t('sim.salary')} checked={state.missingSalary} onChange={set('missingSalary')} className="py-2.5" />
          <SwitchRow id="sim-risk" label={t('sim.highRisk')} checked={state.highRisk} onChange={set('highRisk')} className="py-2.5" />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && (
          <>
            <Separator />
            <div className="flex items-center justify-around gap-4" aria-live="polite">
              <RiskGauge value={result.fraudProbability} size={120} />
              <div className="space-y-2 text-sm">
                <div><TierBadge tier={result.riskTier} /></div>
                <div className="flex items-center gap-2"><span className="text-muted-foreground">{t('sim.verdict')}</span><VerdictBadge verdict={result.feeVerdict} /></div>
                <div><span className="text-muted-foreground">{t('sim.overcharge')}</span> <span className="font-semibold tabular-nums">{formatNumber(result.overchargeMultiple)}×</span></div>
              </div>
            </div>
            <FactorBars factors={result.topFactors} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
