import { cn } from '@/lib/utils';
import { AlertCircle, Inbox, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { formatNumber, titleCase } from '@/format';
import { useI18n } from '@/i18n';

// Status tints: each palette colour at ~12% behind its own text colour.
const toneClasses = {
  green: 'bg-pass/12 text-pass ring-pass/20 dark:text-[#7FD1AE]',
  amber: 'bg-gold/14 text-amber-fg ring-gold/30',
  red: 'bg-brick/12 text-brick ring-brick/25 dark:text-[#E39A8F]',
  critical: 'bg-brick text-cream ring-brick',
  blue: 'bg-ink-fg/8 text-ink-fg ring-ink-fg/15',
  violet: 'bg-ink-fg/8 text-ink-fg ring-ink-fg/15',
  muted: 'bg-foreground/6 text-muted-foreground ring-foreground/10',
};

export function Tone({ tone = 'muted', className, children }) {
  return (
    <Badge variant="outline" className={cn('rounded-full border-transparent font-heading text-[11px] font-semibold ring-1 ring-inset', toneClasses[tone], className)}>
      {children}
    </Badge>
  );
}

const verdictTone = { Green: 'green', Amber: 'amber', Red: 'red' };
export function VerdictBadge({ verdict }) {
  const { t } = useI18n();
  return verdict ? <Tone tone={verdictTone[verdict]}>{t(`verdict.${verdict}`, {}, verdict)}</Tone> : <Tone>{t('common.notAssessed')}</Tone>;
}

// Neutral wording protects against defamation: no agency is labelled a "scam".
const agencyTone = { verified: 'green', flagged: 'amber', revoked: 'red', not_found: 'red' };
export function AgencyStatusBadge({ status }) {
  const { t } = useI18n();
  return <Tone tone={agencyTone[status]}>{t(`agency.${status}`, {}, titleCase(status))}</Tone>;
}

const riskTone = { low: 'green', medium: 'amber', high: 'red' };
export function RiskLevelBadge({ level }) {
  const { t } = useI18n();
  return <Tone tone={riskTone[level]}>{t(level ? `risk.${level}` : 'risk.unrated', {}, titleCase(level))}</Tone>;
}

const tierTone = { Low: 'green', Moderate: 'amber', High: 'red', Critical: 'critical' };
export function TierBadge({ tier }) {
  const { t } = useI18n();
  return <Tone tone={tierTone[tier]}>{tier ? t(`tier.${tier}`, {}, tier) : '—'}</Tone>;
}

const stepTone = { passed: 'green', in_progress: 'blue', pending: 'muted', reopened: 'amber', expired: 'red', failed: 'red', blocked: 'red' };
export function StatusPill({ status }) {
  const { t } = useI18n();
  return <Tone tone={stepTone[status]}>{t(`status.${status}`, {}, titleCase(status))}</Tone>;
}

const roleTone = { worker: 'blue', nominee: 'violet', admin: 'red' };
export function RoleBadge({ role, label }) {
  const { t } = useI18n();
  return <Tone tone={roleTone[role]}>{label ?? t(`role.${role}`, {}, role)}</Tone>;
}

function gaugeColor(value) {
  if (value >= 50) return 'text-brick';
  if (value >= 20) return 'text-gold';
  return 'text-pass';
}

export function RiskGauge({ value, size = 136, label: customLabel }) {
  const { t } = useI18n();
  const label = customLabel ?? t('gauge.label');
  const percent = Math.min(Math.max(Number(value) || 0, 0), 100);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  return (
    <figure className="flex flex-col items-center gap-1" aria-label={`${label}: ${formatNumber(percent, 1)}%`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="10" className="stroke-muted" />
          <circle
            cx="60" cy="60" r={radius} fill="none" strokeWidth="10" strokeLinecap="round" stroke="currentColor"
            className={cn('transition-[stroke-dashoffset,color] duration-500', gaugeColor(percent))}
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-2xl font-bold tabular-nums">{formatNumber(percent, 1)}%</span>
          <span className="text-[11px] text-muted-foreground">{t('gauge.caption')}</span>
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

// Explainable-AI breakdown: each bar is a factor's contribution to the logit.
export function FactorBars({ factors = [] }) {
  const { t } = useI18n();
  if (!factors.length) return <p className="text-sm text-muted-foreground">{t('factor.none')}</p>;
  const max = Math.max(...factors.map(factor => Math.abs(factor.weightContribution)), 0.0001);
  return (
    <ul className="space-y-3">
      {factors.map(factor => {
        const raises = factor.weightContribution > 0;
        return (
          <li key={factor.factor} title={factor.description}>
            <div className="mb-1 flex justify-between text-sm">
              <span>{t(`factor.${factor.factor}`, {}, titleCase(factor.factor))}</span>
              <span className={cn('tabular-nums font-medium', raises ? 'text-brick' : 'text-pass')}>
                {raises ? '+' : ''}{formatNumber(factor.weightContribution)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-[width] duration-500', raises ? 'bg-brick' : 'bg-pass')}
                style={{ width: `${(Math.abs(factor.weightContribution) / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function PageHeader({ title, description, badge, children }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold sm:text-[30px]">{title}</h1>
          {badge && <span className="rounded-[5px] bg-[#10241C] px-2.5 dark:ring-1 dark:ring-gold/40 py-[3px] font-heading text-[11px] font-semibold text-[#F4D58D]">{badge}</span>}
        </div>
        {description && <p className="max-w-[560px] text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

const kpiAccent = { default: 'text-foreground', green: 'text-pass', amber: 'text-gold', red: 'text-brick' };
export function KpiCard({ label, value, hint, tone = 'default' }) {
  return (
    <Card size="sm" className="h-full">
      <CardContent className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn('font-heading text-[1.65rem] leading-tight font-bold tabular-nums', kpiAccent[tone])}>{value}</p>
        {hint && <p className="truncate text-xs text-muted-foreground" title={hint}>{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function ErrorAlert({ error, className }) {
  if (!error) return null;
  return (
    <Alert variant="destructive" className={cn('mb-4', className)}>
      <AlertCircle />
      <AlertDescription>{error.status ? <strong className="mr-1">{error.status}</strong> : null}{error.message}</AlertDescription>
    </Alert>
  );
}

export function Spinner({ className, label }) {
  const { t } = useI18n();
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-label={label ?? t('common.loading')} />;
}

export function EmptyState({ title, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
      <Inbox className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="max-w-sm text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

export function Field({ id, label, hint, className, children }) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SwitchRow({ id, label, checked, onChange, className }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-1', className)}>
      <Label htmlFor={id} className="font-normal">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={value => onChange(Boolean(value))} />
    </div>
  );
}

// Shows a live request/response pair for the security demos (403 proofs).
export function SecurityResultCard({ result, expectStatus = 403 }) {
  const { t } = useI18n();
  if (!result || result.loading) return null;
  const blocked = result.status === expectStatus;
  const Icon = blocked ? ShieldAlert : ShieldCheck;
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-ink bg-ink text-cream" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2 border-b border-card/10 px-3 py-2">
        <code className="truncate text-xs">{result.method.toUpperCase()} /api{result.url}</code>
        <span className={cn('rounded px-2 py-0.5 text-xs font-semibold', blocked ? 'bg-brick' : 'bg-pass')}>
          {result.status} {blocked ? t('security.forbidden') : result.status === 200 ? 'OK' : ''}
        </span>
      </div>
      <div className="flex gap-2 px-3 py-2 text-xs text-cream/80">
        <Icon className={cn('size-4 shrink-0', blocked ? 'text-[#E39A8F]' : 'text-[#7FD1AE]')} aria-hidden="true" />
        <span>
          {blocked ? t('security.blocked') : t('security.allowed')}
          <span className="text-cream/50"> · {result.ms} ms</span>
        </span>
      </div>
      <pre className="max-h-32 overflow-auto px-3 pb-3 text-[11px] text-[#CFE3D6]">{JSON.stringify(result.body, null, 2).slice(0, 600)}</pre>
    </div>
  );
}
