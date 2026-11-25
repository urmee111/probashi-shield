import { Fragment, useState } from 'react';
import { Lock, Mail, MessageCircle, Route, Banknote, UserRound } from 'lucide-react';
import { DEMO_ACCOUNTS, apiError } from '@/api';
import { useAuth } from '@/auth';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import Brand from '@/components/Brand';
import LanguageToggle from '@/components/LanguageToggle';
import ThemeToggle from '@/components/ThemeToggle';
import { initials } from '@/components/AppNavbar';
import { ErrorAlert, Spinner } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ROUTE = 'M40,250 C140,170 220,280 320,200 C420,120 470,210 560,130 C610,85 640,70 680,40';
const AVATAR = {
  worker: 'bg-pass text-white',
  worker2: 'bg-[#1F6B4C] text-white',
  nominee: 'bg-gold text-[#10241C]',
  admin: 'bg-ink text-[#EDEFE4] ring-1 ring-foreground/15',
};

// Renders "*word*" in a translated string as gold emphasis.
function Emphasis({ text }) {
  return text.split('*').map((part, index) => (index % 2 ? <em key={index} className="text-[#F4D58D] not-italic">{part}</em> : <Fragment key={index}>{part}</Fragment>));
}

function RoadArt({ className }) {
  return (
    <svg className={className} viewBox="0 0 700 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path id="ps-login-route" className="ps-wave" d={ROUTE} stroke="rgb(237 239 228 / 0.22)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path className="ps-login-draw" d={ROUTE} stroke="var(--gold)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="40" cy="250" r="6" fill="var(--pass)" stroke="#EDEFE4" strokeWidth="2" />
      <text x="52" y="268" fontFamily="Space Grotesk" fontSize="11" fill="#C9D6CC">Dhaka</text>
      <circle cx="320" cy="200" r="5" fill="var(--gold)" />
      <circle cx="560" cy="130" r="5" fill="var(--gold)" />
      <circle cx="680" cy="40" r="6" fill="var(--gold)" stroke="#EDEFE4" strokeWidth="2" />
      <g className="ps-login-plane">
        <path d="M0,-7 L16,0 L0,7 L4,0 Z" fill="#F4D58D" />
        <animateMotion dur="7s" repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".45 0 .55 1">
          <mpath href="#ps-login-route" />
        </animateMotion>
      </g>
    </svg>
  );
}

function StampSticker({ className }) {
  return (
    <svg className={cn('ps-login-stamp absolute', className)} viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="52" fill="none" stroke="#B9841C" strokeWidth="4" />
      <circle cx="60" cy="60" r="43" fill="none" stroke="#B9841C" strokeWidth="1.5" strokeDasharray="3 4" />
      <text x="60" y="56" textAnchor="middle" fontFamily="Space Grotesk" fontWeight="700" fontSize="17" fill="#F4D58D">VERIFIED</text>
      <text x="60" y="76" textAnchor="middle" fontFamily="Space Grotesk" fontSize="10" fill="#C9D6CC">BMET · LEGAL FEE</text>
    </svg>
  );
}

function PassportSticker({ className }) {
  return (
    <svg className={cn('ps-login-sticker absolute -rotate-8 [animation-delay:-1s]', className)} viewBox="0 0 90 120" aria-hidden="true">
      <rect x="2" y="2" width="86" height="116" rx="10" fill="#175C42" stroke="#F4D58D" strokeWidth="2" />
      <circle cx="45" cy="50" r="18" fill="none" stroke="#F4D58D" strokeWidth="2" />
      <path d="M27 50 H63 M45 32 C38 40 38 60 45 68 M45 32 C52 40 52 60 45 68" stroke="#F4D58D" strokeWidth="1.5" fill="none" />
      <text x="45" y="92" textAnchor="middle" fontFamily="Space Grotesk" fontWeight="700" fontSize="11" fill="#F4D58D">PASSPORT</text>
    </svg>
  );
}

function TicketSticker({ className }) {
  return (
    <svg className={cn('ps-login-sticker absolute rotate-6 [animation-delay:-2s]', className)} viewBox="0 0 140 60" aria-hidden="true">
      <rect x="1" y="1" width="138" height="58" rx="12" fill="#FDFCF6" />
      <path d="M100 1 V59" stroke="#B9841C" strokeDasharray="3 3" />
      <text x="14" y="25" fontFamily="Space Grotesk" fontWeight="700" fontSize="14" fill="#10241C">DAC → KUL</text>
      <text x="14" y="44" fontFamily="IBM Plex Sans" fontSize="10" fill="#5B6B61">Flight ready</text>
      <path d="M112 30 L130 24 L126 30 L130 36 Z" fill="#175C42" />
    </svg>
  );
}

function Story() {
  const { t } = useI18n();
  const points = [
    { icon: Banknote, key: 'login.point1' },
    { icon: Route, key: 'login.point2' },
    { icon: MessageCircle, key: 'login.point3' },
  ];
  const [before, after] = t('login.helpline').split('{num}');
  return (
    <section className="relative flex flex-col overflow-hidden bg-ink px-5 pt-5 pb-7 text-[#EDEFE4] sm:px-8 lg:min-h-svh lg:px-12 lg:py-10" aria-labelledby="login-hero">
      <div className="relative z-10 flex items-center gap-2">
        <Brand />
        <div className="ml-auto flex items-center gap-1">
          <LanguageToggle tone="dark" />
          <ThemeToggle tone="dark" />
        </div>
      </div>

      {/* Decorative journey art: a road from Dhaka abroad, a plane, and three stickers. */}
      <div className="pointer-events-none absolute inset-x-0 top-14 h-36 lg:top-[70px] lg:h-[300px]" aria-hidden="true">
        <RoadArt className="size-full opacity-85 lg:opacity-100" />
      </div>
      <StampSticker className="top-[72px] right-[30%] w-16 lg:top-[110px] lg:right-[34%] lg:w-[104px]" />
      <PassportSticker className="top-[70px] right-[7%] w-[52px] lg:top-[150px] lg:right-[8%] lg:w-[92px]" />
      <TicketSticker className="top-[330px] left-[38%] hidden w-[120px] lg:block" />

      <div className="relative z-10 mt-36 lg:mt-auto">
        <h1 id="login-hero" className="max-w-[14ch] text-[28px] leading-[1.08] font-bold lg:text-[clamp(30px,3.4vw,44px)]">
          <Emphasis text={t('login.hero')} />
        </h1>
        <p className="mt-2.5 max-w-md text-[15px] text-[#C9D6CC]">{t('login.heroSub')}</p>
        <ul className="mt-6 hidden max-w-[420px] gap-3 lg:grid">
          {points.map(({ icon: Icon, key }, index) => (
            <li key={key} className="ps-login-rise flex items-start gap-3 text-sm text-[#DDE5DF]" style={{ animationDelay: `${0.9 + index * 0.15}s` }}>
              <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-[#B9841C]/18 text-[#F4D58D]"><Icon className="size-3.5" aria-hidden="true" /></span>
              {t(key)}
            </li>
          ))}
        </ul>
      </div>
      <p className="relative z-10 mt-7 hidden text-xs text-[#9FB3A7] lg:block">
        {before}<b className="font-heading text-[#F4D58D]">16135</b>{after}
      </p>
    </section>
  );
}

function IconField({ id, label, icon: Icon, hint, ...input }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-[13px] font-semibold">{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input id={id} className="h-12 rounded-[11px] pl-11 text-[15px] focus-visible:border-pass focus-visible:ring-pass/15" {...input} />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function LoginPage() {
  const { login, register, switchTo, switching } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const update = field => event => setForm(current => ({ ...current, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form);
    } catch (failure) {
      setError(apiError(failure));
      setBusy(false);
    }
  }

  async function quickLogin(email) {
    setError(null);
    try {
      await switchTo(email);
    } catch (failure) {
      setError(apiError(failure));
    }
  }

  function switchMode(next) {
    setMode(next);
    setError(null);
  }

  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <Story />

      <main className="grid place-items-center px-[18px] pt-7 pb-10 sm:px-6 lg:py-10">
        <div className="ps-login-rise w-full max-w-[430px]" style={{ animationDelay: '0.15s' }}>
          <h2 className="text-[26px] font-bold">{mode === 'login' ? t('login.back') : t('login.createTitle')}</h2>
          <p className="mt-1.5 mb-5 text-sm text-muted-foreground">{mode === 'login' ? t('login.continue') : t('login.tagline')}</p>

          <div role="tablist" aria-label={t('login.signIn')} className="mb-5 grid grid-cols-2 rounded-xl bg-foreground/6 p-1">
            {['login', 'register'].map(value => (
              <button
                key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => switchMode(value)}
                className={cn('h-10 rounded-[9px] text-sm font-semibold transition-colors',
                  mode === value ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(16_36_28/0.12)]' : 'text-muted-foreground hover:text-foreground')}
              >
                {value === 'login' ? t('login.signIn') : t('login.register')}
              </button>
            ))}
          </div>

          <ErrorAlert error={error} />
          <form onSubmit={submit} className="space-y-3.5">
            {mode === 'register' && (
              <IconField id="name" label={t('login.name')} icon={UserRound} required maxLength={150} value={form.name} onChange={update('name')} autoComplete="name" />
            )}
            <IconField id="email" label={t('login.email')} icon={Mail} type="email" required value={form.email} onChange={update('email')} autoComplete="email" placeholder="you@example.com" />
            <IconField
              id="password" label={t('login.password')} icon={Lock} type="password" required minLength={mode === 'register' ? 8 : 1}
              hint={mode === 'register' ? t('login.passwordHint') : undefined}
              value={form.password} onChange={update('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            <Button type="submit" className="ps-login-shine mt-2 h-[50px] w-full rounded-[11px] text-[15px] font-semibold" disabled={busy}>
              {busy && <Spinner />}{mode === 'login' ? t('login.signIn') : t('login.create')}
            </Button>
          </form>

          <div className="mt-6 mb-3.5 flex items-center gap-3 text-[12.5px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />{t('login.orDemo')}<span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {DEMO_ACCOUNTS.map((account, index) => (
              <button
                key={account.email} type="button" disabled={Boolean(switching)} onClick={() => quickLogin(account.email)}
                title={t(`demo.blurb.${account.key}`)} style={{ animationDelay: `${0.5 + index * 0.1}s` }}
                className="ps-login-rise flex min-h-[62px] items-center gap-2.5 rounded-[14px] border border-border bg-card px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:border-gold disabled:pointer-events-none disabled:opacity-60"
              >
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-full font-heading text-xs font-bold', AVATAR[account.key])}>{initials(account.name)}</span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-semibold">{account.name.split(' ')[0]}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t(`demo.${account.key}`)}</span>
                </span>
                {switching === account.email && <Spinner className="ml-auto" />}
              </button>
            ))}
          </div>
          <p className="mt-[18px] text-center text-xs text-muted-foreground">{t('login.footer')}</p>
        </div>
      </main>
    </div>
  );
}
