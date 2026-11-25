import { Fragment, useState } from 'react';
import { Banknote, Lock, Mail, MessageCircle, Route, UserRound } from 'lucide-react';
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

const ROUTE = 'M30,250 C130,170 210,280 310,200 C410,120 460,210 550,130 C600,85 640,70 675,40';
const AVATAR = {
  worker: 'bg-pass text-white',
  worker2: 'bg-[#1F6B4C] text-white',
  nominee: 'bg-gold text-[#10241C]',
  admin: 'bg-ink text-[#EDEFE4] ring-1 ring-foreground/15',
};

// Renders "*word*" in a translated string as gold emphasis.
function Emphasis({ text }) {
  return text.split('*').map((part, index) => (index % 2 ? <em key={index} className="text-gold not-italic">{part}</em> : <Fragment key={index}>{part}</Fragment>));
}

// A round pin placed by viewBox coordinates (700 x 300), so it stays round at any width.
function Pin({ x, y, color }) {
  return (
    <span
      className="absolute -m-1.5 size-3 rounded-full border-2 border-card"
      style={{ left: `${(x / 700) * 100}%`, top: `${(y / 300) * 100}%`, background: color, boxShadow: `0 0 0 1px ${color}` }}
    />
  );
}

/*
 * The picture: a road from Dhaka abroad, a plane flying it and three stickers.
 * Everything is placed in % of this box, which has a fixed aspect ratio and sits
 * above the text in normal flow, so it scales with the screen and cannot overlap the copy.
 */
function JourneyArt() {
  return (
    <div className="relative aspect-[7/3] max-h-[260px] w-full max-[400px]:aspect-[7/3.4]" aria-hidden="true">
      <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 700 300" preserveAspectRatio="none">
        <path id="ps-login-route" className="ps-wave" d={ROUTE} stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path className="ps-login-draw" d={ROUTE} stroke="var(--gold)" strokeWidth="2.5" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <g className="ps-login-plane">
          <path d="M0,-7 L16,0 L0,7 L4,0 Z" fill="var(--pass)" />
          <animateMotion dur="7s" repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".45 0 .55 1">
            <mpath href="#ps-login-route" />
          </animateMotion>
        </g>
      </svg>
      <Pin x={30} y={250} color="var(--pass)" />
      <span className="absolute font-heading text-[11px] font-semibold text-muted-foreground" style={{ left: `${(30 / 700) * 100}%`, top: `calc(${(250 / 300) * 100}% + 10px)` }}>Dhaka</span>
      <Pin x={675} y={40} color="var(--gold)" />

      <svg className="ps-login-stamp absolute top-[2%] left-[44%] w-[17%] drop-shadow-[0_6px_10px_rgb(16_36_28/0.16)]" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="56" fill="var(--card)" />
        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--gold)" strokeWidth="4" />
        <circle cx="60" cy="60" r="43" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeDasharray="3 4" />
        <text x="60" y="56" textAnchor="middle" fontFamily="Space Grotesk" fontWeight="700" fontSize="17" fill="var(--gold)">VERIFIED</text>
        <text x="60" y="76" textAnchor="middle" fontFamily="Space Grotesk" fontSize="10" fill="var(--muted-foreground)">BMET · LEGAL FEE</text>
      </svg>
      <svg className="ps-login-sticker absolute top-[10%] right-[3%] w-[13%] -rotate-8 drop-shadow-[0_6px_10px_rgb(16_36_28/0.16)] [animation-delay:-1s]" viewBox="0 0 90 120">
        <rect x="2" y="2" width="86" height="116" rx="10" fill="#175C42" stroke="#0D2B22" strokeWidth="1" />
        <circle cx="45" cy="50" r="18" fill="none" stroke="#F4D58D" strokeWidth="2" />
        <path d="M27 50 H63 M45 32 C38 40 38 60 45 68 M45 32 C52 40 52 60 45 68" stroke="#F4D58D" strokeWidth="1.5" fill="none" />
        <text x="45" y="92" textAnchor="middle" fontFamily="Space Grotesk" fontWeight="700" fontSize="11" fill="#F4D58D">PASSPORT</text>
      </svg>
      <svg className="ps-login-sticker absolute bottom-0 left-[20%] w-[20%] rotate-5 drop-shadow-[0_6px_10px_rgb(16_36_28/0.16)] [animation-delay:-2s]" viewBox="0 0 140 60">
        <rect x="1" y="1" width="138" height="58" rx="12" fill="#FDFCF6" stroke="rgb(16 36 28 / .14)" />
        <path d="M100 1 V59" stroke="#B9841C" strokeDasharray="3 3" />
        <text x="14" y="25" fontFamily="Space Grotesk" fontWeight="700" fontSize="14" fill="#10241C">DAC → KUL</text>
        <text x="14" y="44" fontFamily="IBM Plex Sans" fontSize="10" fill="#5B6B61">Flight ready</text>
        <path d="M112 30 L130 24 L126 30 L130 36 Z" fill="#175C42" />
      </svg>
    </div>
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
    <section className="mx-auto w-full max-w-[560px] text-foreground min-[861px]:max-w-none" aria-labelledby="login-hero">
      <JourneyArt />
      <div className="mt-[clamp(14px,2.5vw,28px)]">
        <h1 id="login-hero" className="max-w-[14ch] text-[clamp(26px,3.6vw,44px)] leading-[1.08] font-bold">
          <Emphasis text={t('login.hero')} />
        </h1>
        <p className="mt-2.5 text-[clamp(14px,1.3vw,16px)] text-muted-foreground">{t('login.heroSub')}</p>
        <ul className="mt-5 hidden gap-2.5 min-[861px]:grid">
          {points.map(({ icon: Icon, key }, index) => (
            <li key={key} className="ps-login-rise flex items-center gap-3 text-sm" style={{ animationDelay: `${0.9 + index * 0.15}s` }}>
              <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-pass/10 text-pass"><Icon className="size-[15px]" aria-hidden="true" /></span>
              {t(key)}
            </li>
          ))}
        </ul>
        <p className="mt-5 hidden text-[12.5px] text-muted-foreground min-[861px]:block">
          {before}<b className="font-heading text-pass">16135</b>{after}
        </p>
      </div>
    </section>
  );
}

function IconField({ id, label, icon: Icon, hint, ...input }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-[13px] font-semibold">{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input id={id} className="h-[46px] rounded-[11px] bg-background/60 pl-11 text-[15px] focus-visible:border-pass focus-visible:ring-pass/15" {...input} />
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
    <div className="min-h-svh bg-background">
      <div className="mx-auto flex min-h-svh max-w-[1120px] flex-col p-[clamp(16px,3vw,36px)]">
        <header className="flex items-center gap-2">
          <Brand tone="light" />
          <div className="ml-auto flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>

        <div className="grid flex-1 items-start gap-[clamp(24px,5vw,64px)] py-[clamp(12px,3vw,32px)] min-[861px]:grid-cols-[minmax(0,1fr)_minmax(0,420px)] min-[861px]:items-center">
          <Story />

          <main
            className="ps-login-rise mx-auto w-full max-w-[460px] rounded-[20px] border border-border bg-card p-[clamp(20px,2.6vw,30px)] shadow-[0_20px_50px_-28px_rgb(16_36_28/0.35)] min-[861px]:max-w-none"
            style={{ animationDelay: '0.15s' }}
          >
            <h2 className="text-[clamp(22px,2vw,26px)] font-bold">{mode === 'login' ? t('login.back') : t('login.createTitle')}</h2>
            <p className="mt-1.5 mb-[18px] text-sm text-muted-foreground">{mode === 'login' ? t('login.continue') : t('login.tagline')}</p>

            <div role="tablist" aria-label={t('login.signIn')} className="mb-4 grid grid-cols-2 rounded-xl bg-foreground/6 p-1">
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
            <form onSubmit={submit} className="space-y-3">
              {mode === 'register' && (
                <IconField id="name" label={t('login.name')} icon={UserRound} required maxLength={150} value={form.name} onChange={update('name')} autoComplete="name" />
              )}
              <IconField id="email" label={t('login.email')} icon={Mail} type="email" required value={form.email} onChange={update('email')} autoComplete="email" placeholder="you@example.com" />
              <IconField
                id="password" label={t('login.password')} icon={Lock} type="password" required minLength={mode === 'register' ? 8 : 1}
                hint={mode === 'register' ? t('login.passwordHint') : undefined}
                value={form.password} onChange={update('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <Button type="submit" className="ps-login-shine mt-2 h-12 w-full rounded-[11px] text-[15px] font-semibold" disabled={busy}>
                {busy && <Spinner />}{mode === 'login' ? t('login.signIn') : t('login.create')}
              </Button>
            </form>

            <div className="mt-5 mb-3 flex items-center gap-3 text-[12.5px] text-muted-foreground">
              <span className="h-px flex-1 bg-border" />{t('login.orDemo')}<span className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((account, index) => (
                <button
                  key={account.email} type="button" disabled={Boolean(switching)} onClick={() => quickLogin(account.email)}
                  title={t(`demo.blurb.${account.key}`)} style={{ animationDelay: `${0.5 + index * 0.1}s` }}
                  className="ps-login-rise flex min-h-14 min-w-0 items-center gap-2.5 rounded-[13px] border border-border bg-background/60 px-2.5 py-2 text-left transition hover:-translate-y-0.5 hover:border-gold disabled:pointer-events-none disabled:opacity-60"
                >
                  <span className={cn('grid size-[34px] shrink-0 place-items-center rounded-full font-heading text-xs font-bold max-[400px]:size-[30px]', AVATAR[account.key])}>{initials(account.name)}</span>
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-sm font-semibold">{account.name.split(' ')[0]}</span>
                    <span className="block truncate text-xs text-muted-foreground">{t(`demo.${account.key}`)}</span>
                  </span>
                  {switching === account.email && <Spinner className="ml-auto" />}
                </button>
              ))}
            </div>
            <p className="mt-3.5 text-center text-xs text-muted-foreground">{t('login.footer')}</p>
          </main>
        </div>
      </div>
    </div>
  );
}
