import { AlertTriangle, CheckCircle2, Scale, ShieldX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBdt, formatDate, formatNumber } from '@/format';
import { useI18n } from '@/i18n';
import { AgencyStatusBadge, FactorBars, RiskGauge, TierBadge, VerdictBadge } from '@/components/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const verdictStyle = {
  Red: { icon: ShieldX, className: 'bg-brick text-white' },
  Amber: { icon: AlertTriangle, className: 'bg-gold text-foreground' },
  Green: { icon: CheckCircle2, className: 'bg-pass text-white' },
};
const fallbackStyle = { icon: AlertTriangle, className: 'bg-muted text-foreground' };

function describeMismatch(mismatch, t) {
  const title = t(`mismatch.${mismatch.code}`, {}, mismatch.code);
  if (mismatch.claims) return [title, mismatch.claims.map(claim => claim.value).join(' vs ')];
  if (mismatch.documentIds) return [title, t('mismatch.document', { ids: mismatch.documentIds.join(', ') })];
  return [title, ''];
}

function Stat({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

export default function AuditResultCard({ report }) {
  const { t } = useI18n();
  if (!report) return null;
  const style = verdictStyle[report.feeVerdict] ?? fallbackStyle;
  const Icon = style.icon;
  const mismatches = report.mismatches ?? [];
  const agencyChecks = report.agencyChecks ?? [];
  const { corridor, fraudRisk } = report;

  return (
    <Card className="animate-in fade-in-0 slide-in-from-bottom-1 gap-0 py-0">
      <div className={cn('flex items-center justify-between gap-4 px-5 py-4', style.className)}>
        <div className="flex items-center gap-3">
          <Icon className="size-6 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-xs opacity-80">{t('audit.label')} {report.auditId ? `#${report.auditId}` : ''}</p>
            <h3 className="font-semibold">{t(`audit.${report.feeVerdict ?? 'unknown'}`, {}, t('audit.unknown'))}</h3>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tabular-nums leading-none">
            {report.overchargeMultiple != null ? `${formatNumber(report.overchargeMultiple)}×` : '—'}
          </p>
          <p className="text-xs opacity-80">{t('audit.ofCap')}</p>
        </div>
      </div>

      <CardContent className="space-y-5 py-5">
        {report.needsConfirmation && (
          <p className="rounded-md bg-gold/10 px-3 py-2 text-sm text-[#7A5510]">{t('audit.excluded')}</p>
        )}
        <div className="grid items-center gap-6 sm:grid-cols-[1fr_auto]">
          <div className="divide-y">
            <Stat label={t('audit.charged')}>{formatBdt(report.chargedFeeBdt)}</Stat>
            <Stat label={t('audit.cap')}>{formatBdt(corridor?.max_legal_fee_bdt)}</Stat>
            <Stat label={t('audit.destination')}>{report.destinationCountry ?? '—'}</Stat>
            <Stat label={t('audit.verdict')}><VerdictBadge verdict={report.feeVerdict} /></Stat>
            <Stat label={t('audit.tier')}><TierBadge tier={fraudRisk?.riskTier} /></Stat>
          </div>
          <RiskGauge value={fraudRisk?.fraudProbability} />
        </div>

        {corridor && (
          <div className="flex gap-3 rounded-lg border bg-muted/40 p-3">
            <Scale className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="text-sm">
              <p className="font-medium">{t('audit.citation', { country: corridor.country })}</p>
              <p className="text-muted-foreground">{corridor.rule_source || t('audit.noSource')}</p>
              <p className="text-xs text-muted-foreground">{corridor.effective_date ? t('audit.effective', { date: formatDate(corridor.effective_date) }) : t('audit.noDate')}</p>
            </div>
          </div>
        )}

        <Separator />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <section>
              <h4 className="mb-2 text-sm font-semibold">{t('audit.discrepancies', { count: mismatches.length })}</h4>
              {mismatches.length ? (
                <ul className="space-y-2">
                  {mismatches.map(mismatch => {
                    const [title, detail] = describeMismatch(mismatch, t);
                    return (
                      <li key={mismatch.code} className="rounded-md border-l-2 border-brick bg-brick/6 px-3 py-1.5 text-sm">
                        <p className="font-medium">{title}</p>
                        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="text-sm text-muted-foreground">{t('audit.noneFound')}</p>}
            </section>
            <section>
              <h4 className="mb-2 text-sm font-semibold">{t('audit.registry')}</h4>
              <ul className="divide-y text-sm">
                {agencyChecks.map(check => (
                  <li key={check.license} className="flex items-center justify-between gap-2 py-1.5">
                    <code className="text-xs">{check.license}</code>
                    <AgencyStatusBadge status={check.status} />
                  </li>
                ))}
                {!agencyChecks.length && <li className="py-1.5 text-muted-foreground">{t('audit.noLicences')}</li>}
              </ul>
            </section>
          </div>
          <section>
            <h4 className="mb-3 text-sm font-semibold">{t('audit.why')}</h4>
            <FactorBars factors={fraudRisk?.topFactors} />
          </section>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer font-medium">{t('audit.explanation')}</summary>
          <p className="mt-2 text-muted-foreground">{report.explanationText}</p>
        </details>
      </CardContent>
    </Card>
  );
}
