import { cn } from '@/lib/utils';
import { AlertCircle, Inbox, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { formatNumber, titleCase } from '@/format';
import { useI18n } from '@/i18n';

const toneClasses = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  critical: 'bg-red-700 text-white ring-red-700',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  muted: 'bg-muted text-muted-foreground ring-foreground/10',
};

export function Tone({ tone = 'muted', className, children }) {
  return (
    <Badge variant="outline" className={cn('border-transparent ring-1 ring-inset font-medium', toneClasses[tone], className)}>
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

const stepTone = { passed: 'green', in_progress: 'blue', pending: 'muted', reopened: 'amber', expired: 'red', failed: 'red' };
export function StatusPill({ status }) {
  const { t } = useI18n();
  return <Tone tone={stepTone[status]} className="rounded-full">{t(`status.${status}`, {}, titleCase(status))}</Tone>;
}

const roleTone = { worker: 'blue', nominee: 'violet', admin: 'red' };
export function RoleBadge({ role, label }) {
  const { t } = useI18n();
  return <Tone tone={roleTone[role]}>{label ?? t(`role.${role}`, {}, role)}</Tone>;
}

function gaugeColor(value) {
  if (value >= 80) return 'text-red-700';
  if (value >= 50) return 'text-red-500';
  if (value >= 20) return 'text-amber-500';
  return 'text-emerald-500';
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
          <span className="text-2xl font-semibold tabular-nums">{formatNumber(percent, 1)}%</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('gauge.caption')}</span>
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
              <span className={cn('tabular-nums font-medium', raises ? 'text-red-600' : 'text-emerald-600')}>
                {raises ? '+' : ''}{formatNumber(factor.weightContribution)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-[width] duration-500', raises ? 'bg-red-500' : 'bg-emerald-500')}
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
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {badge && <Badge variant="secondary">{badge}</Badge>}
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

const kpiAccent = { default: '', green: 'text-emerald-600', amber: 'text-amber-600', red: 'text-red-600' };
export function KpiCard({ label, value, hint, tone = 'default' }) {
  return (
    <Card size="sm" className="h-full">
      <CardContent className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn('text-2xl font-semibold tabular-nums', kpiAccent[tone])}>{value}</p>
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
    <div className="mt-3 overflow-hidden rounded-lg border bg-zinc-950 text-zinc-100" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <code className="truncate text-xs">{result.method.toUpperCase()} /api{result.url}</code>
        <span className={cn('rounded px-2 py-0.5 text-xs font-semibold', blocked ? 'bg-red-600' : 'bg-emerald-600')}>
          {result.status} {blocked ? t('security.forbidden') : result.status === 200 ? 'OK' : ''}
        </span>
      </div>
      <div className="flex gap-2 px-3 py-2 text-xs text-zinc-300">
        <Icon className={cn('size-4 shrink-0', blocked ? 'text-red-400' : 'text-emerald-400')} aria-hidden="true" />
        <span>
          {blocked ? t('security.blocked') : t('security.allowed')}
          <span className="text-zinc-500"> · {result.ms} ms</span>
        </span>
      </div>
      <pre className="max-h-32 overflow-auto px-3 pb-3 text-[11px] text-cyan-300">{JSON.stringify(result.body, null, 2).slice(0, 600)}</pre>
    </div>
  );
}
